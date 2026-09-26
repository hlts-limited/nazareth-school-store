import type { OrderStatus, Prisma } from "@prisma/client";
import { db, type Tx } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { naira, orderNo, parseOrderNo } from "@/shared/lib/format";
import { reserve, release } from "@/modules/inventory";
import { balance, credit, debit } from "@/modules/wallet";
import { notify } from "@/modules/notifications";
import { getSettings } from "@/modules/settings";
import { amountDue, UNPAID_STATUSES } from "./status";

export const orderInclude = {
  parent: true,
  lines: { include: { pupil: { include: { class: true } }, variant: { include: { item: { include: { category: { include: { parent: true } } } } } } }, orderBy: { pupilId: "asc" } },
  payments: { include: { receipts: { orderBy: { uploadedAt: "asc" } } }, orderBy: { createdAt: "asc" } },
  events: { orderBy: { createdAt: "asc" } },
  invoice: true,
  pickups: true,
} satisfies Prisma.OrderInclude;
export type OrderFull = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export async function addEvent(tx: Tx, orderId: string, message: string, actorName?: string) {
  await tx.orderEvent.create({ data: { orderId, message, actorName } });
}

export async function getOrderByNo(no: string, parentId?: string) {
  const n = parseOrderNo(no);
  if (!n) return null;
  return db.order.findFirst({ where: { number: n, ...(parentId ? { parentId } : {}) }, include: orderInclude });
}

export async function ordersForParent(parentId: string, take = 50) {
  return db.order.findMany({ where: { parentId }, include: { lines: { include: { pupil: true } } }, orderBy: { createdAt: "desc" }, take });
}

export async function ordersForPupil(pupilId: string) {
  return db.order.findMany({ where: { lines: { some: { pupilId } } }, include: { lines: { where: { pupilId } } }, orderBy: { createdAt: "desc" }, take: 30 });
}

/**
 * Turn the parent's cart into one order.
 * Stock is reserved atomically; wallet balances are used for the children ticked at checkout.
 */
export async function checkout(parentId: string, method: "PAYSTACK" | "TRANSFER", useWalletFor: string[], actorName: string) {
  const order = await db.$transaction(async (tx) => {
    const cart = await tx.cartItem.findMany({
      where: { parentId },
      include: { pupil: true, variant: { include: { item: { include: { pileParts: { orderBy: { sortOrder: "asc" }, include: { book: { include: { variants: true } } } } } } } } },
    });
    if (!cart.length) throw new UserError("Your cart is empty.");
    type Line = { pupilId: string; variantId: string; qty: number; unitPrice: number; itemName: string; variantLabel: string; pileItemId?: string; pileName?: string; reserved?: boolean };
    const lines: Line[] = [];
    for (const c of cart) {
      const it = c.variant.item;
      if (!it.isActive) throw new UserError(`${it.name} is no longer sold. Remove it from your cart.`);
      if (it.isPile) {
        // A pile becomes one line per book. Books in stock are reserved now; the rest wait for stock (no reservation).
        if (!it.pileParts.length) throw new UserError(`${it.name} has no books in it yet. Remove it from your cart.`);
        for (const pt of it.pileParts) {
          const bv = pt.book.variants[0];
          if (!bv) throw new UserError(`${pt.book.name} in ${it.name} can't be sold right now. Contact the school office.`);
          const qty = pt.qty * c.qty;
          const reserved = await reserve(tx, bv.id, qty);
          lines.push({ pupilId: c.pupilId, variantId: bv.id, qty, unitPrice: bv.priceOverride ?? pt.book.price, itemName: pt.book.name, variantLabel: bv.label, pileItemId: it.id, pileName: it.name, reserved });
        }
        continue;
      }
      const okReserve = await reserve(tx, c.variantId, c.qty);
      if (!okReserve) throw new UserError(`Sorry, ${it.name}${c.variant.label !== "Standard" ? ` (${c.variant.label})` : ""} just sold out in that quantity. Update your cart and try again.`);
      lines.push({ pupilId: c.pupilId, variantId: c.variantId, qty: c.qty, unitPrice: c.variant.priceOverride ?? it.price, itemName: it.name, variantLabel: c.variant.label });
    }
    const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0);
    const o = await tx.order.create({
      data: { parentId, method, subtotal, lines: { create: lines }, invoice: { create: {} }, events: { create: { message: "Order placed", actorName } } },
    });
    // Wallet balances
    let walletUsed = 0;
    for (const pid of [...new Set(useWalletFor)]) {
      const groupTotal = lines.filter((l) => l.pupilId === pid).reduce((a, l) => a + l.unitPrice * l.qty, 0);
      const use = Math.min(await balance(pid, tx), groupTotal);
      if (use > 0) { await debit(tx, pid, "CHECKOUT_DEBIT", use, { orderId: o.id, actorName }); walletUsed += use; }
    }
    await tx.cartItem.deleteMany({ where: { parentId } });
    if (walletUsed === subtotal) {
      await addEvent(tx, o.id, "Paid in full from wallet");
      await tx.invoice.update({ where: { orderId: o.id }, data: { status: "APPROVED", approvedAt: new Date() } });
      return tx.order.update({ where: { id: o.id }, data: { walletUsed, method: "WALLET", status: "PAYMENT_APPROVED" } });
    }
    return tx.order.update({ where: { id: o.id }, data: { walletUsed } });
  });
  if (order.status === "PAYMENT_APPROVED") await notify(parentId, `Order ${orderNo(order.number)} paid`, `Order ${orderNo(order.number)} was paid from your children's wallets. We'll text you when it's ready for pick-up.`);
  return order;
}

/** Cancel an order: release reserved stock and put any money already paid into the child's wallet. */
export async function cancelOrder(tx: Tx, orderId: string, reason: string, actorName: string) {
  const o = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!o || o.status === "CANCELLED" || o.status === "HANDED_OUT") return null;
  // Only give back stock that was actually held (pile books awaiting stock hold none)
  for (const l of o.lines) if (l.reserved && l.status !== "HANDED_OUT" && l.status !== "CANCELLED") await release(tx, l.variantId, l.qty);
  await tx.orderLine.updateMany({ where: { orderId, status: { notIn: ["HANDED_OUT"] } }, data: { status: "CANCELLED" } });
  const refund = o.amountReceived + o.walletUsed;
  const firstPupil = o.lines[0]?.pupilId;
  if (refund > 0 && firstPupil) {
    await credit(tx, firstPupil, "CANCELLED_ORDER_CREDIT", refund, { orderId, reason, actorName, movable: new Set(o.lines.map((l) => l.pupilId)).size > 1 });
  }
  await tx.invoice.updateMany({ where: { orderId }, data: { status: "VOID" } });
  await addEvent(tx, orderId, `Cancelled: ${reason}${refund ? ` · ${naira(refund)} returned to wallet` : ""}`, actorName);
  return tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
}

export async function cancelByParent(parentId: string, orderId: string, actorName: string) {
  const o = await db.order.findFirst({ where: { id: orderId, parentId } });
  if (!o) throw new UserError("Order not found.");
  if (!UNPAID_STATUSES.includes(o.status)) throw new UserError("This order can't be cancelled here. Contact the school office.");
  await db.$transaction((tx) => cancelOrder(tx, orderId, "Cancelled by parent", actorName));
}

/** Daily job: cancel orders left unpaid too long, and remind parents about balances. */
export async function expireUnpaidOrders() {
  const s = await getSettings();
  const cutoff = new Date(Date.now() - s.autoCancelHours * 3600_000);
  const stale = await db.order.findMany({
    where: {
      OR: [
        { status: { in: ["PENDING_PAYMENT", "PAYMENT_REJECTED"] as OrderStatus[] }, updatedAt: { lt: cutoff } },
        { status: "PART_PAID", updatedAt: { lt: cutoff } },
      ],
    },
  });
  let cancelled = 0;
  for (const o of stale) {
    const r = await db.$transaction((tx) => cancelOrder(tx, o.id, `Not paid within ${s.autoCancelHours} hours`, "System"));
    if (r) {
      cancelled++;
      const refund = o.amountReceived + o.walletUsed;
      await notify(o.parentId, `Order ${orderNo(o.number)} cancelled`, `Order ${orderNo(o.number)} was cancelled because it wasn't paid within ${s.autoCancelHours} hours.${refund ? ` ${naira(refund)} you already paid is in your child's wallet.` : ""}`);
    }
  }
  // Balance reminders after 24 hours
  const partPaid = await db.order.findMany({ where: { status: "PART_PAID", updatedAt: { lt: new Date(Date.now() - 24 * 3600_000) } }, include: { events: true } });
  let reminded = 0;
  for (const o of partPaid) {
    if (o.events.some((e) => e.message.startsWith("Balance reminder"))) continue;
    await notify(o.parentId, `Balance due on ${orderNo(o.number)}`, `Reminder: ${naira(amountDue(o))} is still due on order ${orderNo(o.number)}. Pay the balance to complete your order.`, ["sms", "whatsapp", "email"]);
    await db.orderEvent.create({ data: { orderId: o.id, message: "Balance reminder sent", actorName: "System" } });
    reminded++;
  }
  return { cancelled, reminded };
}
