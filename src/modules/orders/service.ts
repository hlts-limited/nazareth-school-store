import type { OrderStatus, Prisma } from "@prisma/client";
import { db, type Tx } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { naira, orderNo, parseOrderNo } from "@/shared/lib/format";
import { reserve, release } from "@/modules/inventory";
import { credit, spendUpTo } from "@/modules/wallet";
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
 * Turn the parent's cart into one order. The parent's wallet is always used first; only what it doesn't cover
 * goes to Paystack.
 */
export async function checkout(parentId: string, method: "PAYSTACK" | "TRANSFER", actorName: string) {
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
    // The wallet first, always
    const walletUsed = await spendUpTo(tx, parentId, subtotal, { orderId: o.id, actorName, reason: `Used for ${orderNo(o.number)}` });
    await tx.cartItem.deleteMany({ where: { parentId } });
    if (walletUsed === subtotal) {
      await addEvent(tx, o.id, "Paid in full from wallet");
      await tx.invoice.update({ where: { orderId: o.id }, data: { status: "APPROVED", approvedAt: new Date() } });
      return tx.order.update({ where: { id: o.id }, data: { walletUsed, method: "WALLET", status: "PAYMENT_APPROVED" } });
    }
    return tx.order.update({ where: { id: o.id }, data: { walletUsed } });
  });
  if (order.status === "PAYMENT_APPROVED") await notify(parentId, `Order ${orderNo(order.number)} paid`, `Order ${orderNo(order.number)} was paid from your wallet. We'll message you on WhatsApp when it's ready for pick-up.`);
  return order;
}

/** Cancel an order: release reserved stock and put any money already paid into the parent's wallet. */
export async function cancelOrder(tx: Tx, orderId: string, reason: string, actorName: string) {
  const o = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!o || o.status === "CANCELLED" || o.status === "HANDED_OUT") return null;
  // Only give back stock that was actually held (pile books awaiting stock hold none)
  for (const l of o.lines) if (l.reserved && l.status !== "HANDED_OUT" && l.status !== "CANCELLED") await release(tx, l.variantId, l.qty);
  await tx.orderLine.updateMany({ where: { orderId, status: { notIn: ["HANDED_OUT"] } }, data: { status: "CANCELLED" } });
  const refund = o.amountReceived + o.walletUsed;
  if (refund > 0) await credit(tx, o.parentId, "CANCELLED_ORDER_CREDIT", refund, { orderId, reason, actorName });
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
      await notify(o.parentId, `Order ${orderNo(o.number)} cancelled`, `Order ${orderNo(o.number)} was cancelled because it wasn't paid within ${s.autoCancelHours} hours.${refund ? ` ${naira(refund)} you already paid is in your wallet for your next order.` : ""}`);
    }
  }
  // Balance reminders after 24 hours
  const partPaid = await db.order.findMany({ where: { status: "PART_PAID", updatedAt: { lt: new Date(Date.now() - 24 * 3600_000) } }, include: { events: true } });
  let reminded = 0;
  for (const o of partPaid) {
    if (o.events.some((e) => e.message.startsWith("Balance reminder"))) continue;
    await notify(o.parentId, `Balance due on ${orderNo(o.number)}`, `Reminder: ${naira(amountDue(o))} is still due on order ${orderNo(o.number)}. Pay the balance to complete your order.`, ["whatsapp", "email"]);
    await db.orderEvent.create({ data: { orderId: o.id, message: "Balance reminder sent", actorName: "System" } });
    reminded++;
  }

  // Unpaid orders: one reminder halfway to the cancel deadline, with the date it will be cancelled
  const half = new Date(Date.now() - (s.autoCancelHours / 2) * 3600_000);
  const unpaid = await db.order.findMany({
    where: { status: { in: ["PENDING_PAYMENT", "PAYMENT_REJECTED"] as OrderStatus[] }, updatedAt: { lt: half, gte: cutoff } },
    include: { events: { select: { message: true } } },
  });
  let paymentReminders = 0;
  for (const o of unpaid) {
    if (o.events.some((e) => e.message.startsWith("Payment reminder"))) continue;
    const by = new Date(o.updatedAt.getTime() + s.autoCancelHours * 3600_000)
      .toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });
    await notify(o.parentId, `Order ${orderNo(o.number)} is waiting for payment`,
      `Reminder: order ${orderNo(o.number)} (${naira(amountDue(o))}) is not paid yet. Please pay${o.method === "TRANSFER" ? " and upload your transfer receipt" : ""} by ${by}, or the order will be cancelled.`,
      ["whatsapp", "email"]);
    await db.orderEvent.create({ data: { orderId: o.id, message: "Payment reminder sent", actorName: "System" } });
    paymentReminders++;
  }

  // Receipts nobody has checked for 2 days: one nudge to the accounts staff, listing them
  const slow = await db.order.findMany({
    where: { status: "AWAITING_VERIFICATION", updatedAt: { lt: new Date(Date.now() - 48 * 3600_000) } },
    include: { events: { select: { message: true } } }, orderBy: { updatedAt: "asc" },
  });
  const fresh = slow.filter((o) => !o.events.some((e) => e.message.startsWith("Review reminder")));
  let reviewReminders = 0;
  if (fresh.length) {
    const accounts = await db.user.findMany({
      where: { type: "STAFF", status: "ACTIVE", roles: { some: { role: { permissions: { has: "payments.review" } } } } }, select: { id: true },
    });
    const list = fresh.slice(0, 8).map((o) => orderNo(o.number)).join(", ") + (fresh.length > 8 ? ` and ${fresh.length - 8} more` : "");
    for (const a of accounts) {
      await notify(a.id, `${fresh.length} receipt${fresh.length === 1 ? "" : "s"} waiting over 2 days`,
        `${fresh.length} bank transfer receipt${fresh.length === 1 ? " has" : "s have"} waited more than 2 days for a check: ${list}. Parents are waiting to hear back. Open Payments to review in the back office.`,
        ["whatsapp", "email"]);
    }
    if (accounts.length) {
      await db.orderEvent.createMany({ data: fresh.map((o) => ({ orderId: o.id, message: "Review reminder sent to the accounts office", actorName: "System" })) });
      reviewReminders = fresh.length;
    }
  }
  return { cancelled, reminded, paymentReminders, reviewReminders };
}

/** Order numbers for a list of order ids (e.g. to label wallet entries) */
export async function orderNumbers(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db.order.findMany({ where: { id: { in: ids } }, select: { id: true, number: true } });
  return new Map(rows.map((o) => [o.id, o.number]));
}

/** Is this order one of this parent's? (receipts and invoices check this before showing a file) */
export const parentOwnsOrder = async (orderId: string, parentId: string) => !!(await db.order.findFirst({ where: { id: orderId, parentId }, select: { id: true } }));

export const orderByNumber = (number: number) => db.order.findUnique({ where: { number } });
