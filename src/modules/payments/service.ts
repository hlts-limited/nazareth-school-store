import type { Order, Payment } from "@prisma/client";
import { db, type Tx } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { randomToken, sha256 } from "@/shared/lib/crypto";
import { naira, orderNo } from "@/shared/lib/format";
import { storage } from "@/shared/lib/storage";
import { env } from "@/shared/config/env";
import { credit, debit, balances } from "@/modules/wallet";
import { notify } from "@/modules/notifications";
import { addEvent, amountDue, settle, UNPAID_STATUSES } from "@/modules/orders";
import { initializeTransaction, verifyTransaction } from "./paystack";

type Applied = { outcome: "approved" | "part"; excess: number; balance: number; creditedPupilId?: string; multiChild: boolean };

/**
 * Apply money received to an order (shared by bank transfers and Paystack).
 * Overpayment → order approved, excess credited to a child's wallet (movable if several children).
 * Underpayment → order "Part paid".
 */
async function applyReceived(tx: Tx, order: Order, received: number, actorName: string): Promise<Applied> {
  const due = amountDue(order);
  const r = settle(due, received);
  const lines = await tx.orderLine.findMany({ where: { orderId: order.id }, select: { pupilId: true } });
  const pupils = [...new Set(lines.map((l) => l.pupilId))];
  if (r.outcome === "approved") {
    await tx.order.update({ where: { id: order.id }, data: { status: "PAYMENT_APPROVED", amountReceived: order.amountReceived + r.applied, excess: order.excess + r.excess, rejectReason: null } });
    await tx.invoice.updateMany({ where: { orderId: order.id }, data: { status: "APPROVED", approvedAt: new Date() } });
    if (r.excess > 0) await credit(tx, pupils[0], "OVERPAYMENT_CREDIT", r.excess, { orderId: order.id, reason: `Overpayment on ${orderNo(order.number)}`, actorName, movable: pupils.length > 1 });
    await addEvent(tx, order.id, `Payment approved${r.excess ? ` · ${naira(r.excess)} extra credited to wallet` : ""}`, actorName);
  } else {
    await tx.order.update({ where: { id: order.id }, data: { status: "PART_PAID", amountReceived: order.amountReceived + r.applied } });
    await addEvent(tx, order.id, `Part paid: ${naira(received)} received, ${naira(r.balance)} balance`, actorName);
  }
  return { outcome: r.outcome, excess: r.excess, balance: r.balance, creditedPupilId: r.excess ? pupils[0] : undefined, multiChild: pupils.length > 1 };
}

async function notifyApplied(order: Order, a: Applied, received: number) {
  const no = orderNo(order.number);
  if (a.outcome === "approved") {
    let extra = "";
    if (a.excess && a.creditedPupilId) {
      const p = await db.pupil.findUnique({ where: { id: a.creditedPupilId } });
      extra = ` You paid ${naira(a.excess)} more than was due; it's in ${p?.firstName}'s wallet${a.multiChild ? " (you can move it to another child in the app)" : ""}.`;
    }
    await notify(order.parentId, `Payment for ${no} approved`, `Payment for order ${no} is approved. We'll text you when it's ready for pick-up.${extra}`);
  } else {
    await notify(order.parentId, `Balance due on ${no}`, `We received ${naira(received)} for order ${no}. Balance due: ${naira(a.balance)}. Pay the balance in the app to complete your order.`, ["sms", "whatsapp", "email"]);
  }
}

// ---------- Bank transfer ----------
export async function submitReceipt(parentId: string, orderId: string, file: { buf: Buffer; mime: string; ext: string; name: string }, meta: { bankName: string; amount: number; transferDate: Date }, actorName: string) {
  const order = await db.order.findFirst({ where: { id: orderId, parentId } });
  if (!order) throw new UserError("Order not found.");
  if (!UNPAID_STATUSES.includes(order.status)) throw new UserError("This order isn't waiting for a payment.");
  const key = `receipts/${order.id}/${randomToken(10)}.${file.ext}`;
  await storage().put(key, file.buf, file.mime);
  await db.$transaction(async (tx) => {
    const p = await tx.payment.create({ data: { orderId, method: "TRANSFER", amountDue: amountDue(order), status: "AWAITING_VERIFICATION" } });
    await tx.receipt.create({ data: { paymentId: p.id, fileKey: key, fileName: file.name.slice(0, 120), mimeType: file.mime, size: file.buf.length, sha256: sha256(file.buf), bankName: meta.bankName, amountClaimed: meta.amount, transferDate: meta.transferDate } });
    await tx.order.update({ where: { id: orderId }, data: { status: "AWAITING_VERIFICATION", method: "TRANSFER" } });
    await addEvent(tx, orderId, `Receipt uploaded (${naira(meta.amount)} from ${meta.bankName})`, actorName);
  });
}

export async function reviewQueue() {
  const orders = await db.order.findMany({
    where: { status: "AWAITING_VERIFICATION" },
    include: {
      parent: true,
      lines: { include: { pupil: { include: { class: true } } } },
      payments: { where: { status: "AWAITING_VERIFICATION" }, include: { receipts: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "asc" },
  });
  const hashes = orders.flatMap((o) => o.payments.flatMap((p) => p.receipts.map((r) => r.sha256)));
  const dupes = await db.receipt.findMany({ where: { sha256: { in: hashes } }, include: { payment: { include: { order: true } } } });
  return orders.map((o) => {
    const payment = o.payments[0];
    const receipt = payment?.receipts[payment.receipts.length - 1];
    const dup = receipt ? dupes.find((d) => d.sha256 === receipt.sha256 && d.payment.orderId !== o.id) : undefined;
    return { order: o, payment, receipt, due: amountDue(o), duplicateOf: dup ? { orderNo: orderNo(dup.payment.order.number), uploadedAt: dup.uploadedAt } : null };
  });
}

export async function approveTransfer(paymentId: string, received: number, staff: { id: string; name: string }) {
  if (received < 0) throw new UserError("Enter the amount received.");
  const res = await db.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!p || p.status !== "AWAITING_VERIFICATION") throw new UserError("This payment was already reviewed.");
    await tx.$executeRaw`SELECT 1 FROM "Order" WHERE "id" = ${p.orderId} FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id: p.orderId } });
    const a = await applyReceived(tx, order, received, staff.name);
    await tx.payment.update({ where: { id: p.id }, data: { status: a.outcome === "approved" ? "APPROVED" : "PART_PAID", amountReceived: received, verifiedById: staff.id, verifiedAt: new Date() } });
    if (a.outcome === "approved") await tx.invoice.updateMany({ where: { orderId: order.id }, data: { approvedById: staff.id } });
    return { order, a };
  });
  await notifyApplied(res.order, res.a, received);
  return res;
}

export async function rejectTransfer(paymentId: string, reason: string, staff: { id: string; name: string }) {
  const order = await db.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!p || p.status !== "AWAITING_VERIFICATION") throw new UserError("This payment was already reviewed.");
    await tx.payment.update({ where: { id: p.id }, data: { status: "REJECTED", rejectionReason: reason, verifiedById: staff.id, verifiedAt: new Date() } });
    // If part of the money had already been accepted, the order goes back to "Part paid"
    const status = p.order.amountReceived > 0 ? "PART_PAID" : "PAYMENT_REJECTED";
    await addEvent(tx, p.orderId, `Receipt not accepted: ${reason}`, staff.name);
    return tx.order.update({ where: { id: p.orderId }, data: { status, rejectReason: reason } });
  });
  await notify(order.parentId, `Receipt for ${orderNo(order.number)} not accepted`, `Your receipt for order ${orderNo(order.number)} was not accepted: ${reason}. Please upload a new one in the app.`, ["sms", "email"]);
  return order;
}

// ---------- Wallet ----------
export async function payFromWallet(parentId: string, orderId: string, actorName: string) {
  const res = await db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, parentId } });
    if (!order || !UNPAID_STATUSES.includes(order.status)) throw new UserError("This order isn't waiting for a payment.");
    let due = amountDue(order);
    const kids = await tx.guardian.findMany({ where: { parentId } });
    const bal = await balances(kids.map((k) => k.pupilId), tx);
    const total = Object.values(bal).reduce((a, b) => a + b, 0);
    if (total < due) throw new UserError(`Your children's wallets hold ${naira(total)}; ${naira(due)} is due.`);
    let used = 0;
    for (const k of kids) {
      const use = Math.min(bal[k.pupilId] ?? 0, due);
      if (use > 0) { await debit(tx, k.pupilId, "CHECKOUT_DEBIT", use, { orderId, actorName, reason: `Balance for ${orderNo(order.number)}` }); due -= use; used += use; }
    }
    const updated = await tx.order.update({ where: { id: orderId }, data: { walletUsed: order.walletUsed + used } });
    const a = await applyReceived(tx, updated, 0, actorName); // due is now 0 → approved
    await tx.payment.create({ data: { orderId, method: "WALLET", amountDue: used, amountReceived: used, status: "APPROVED", verifiedAt: new Date() } });
    return { order: updated, a };
  });
  await notifyApplied(res.order, res.a, 0);
}

// ---------- Paystack ----------
export async function startPaystack(parent: { id: string; email: string | null; phone: string | null }, orderId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, parentId: parent.id } });
  if (!order || !UNPAID_STATUSES.includes(order.status)) throw new UserError("This order isn't waiting for a payment.");
  const due = amountDue(order);
  const reference = `${orderNo(order.number)}-${randomToken(6)}`;
  await db.payment.create({ data: { orderId, method: "PAYSTACK", amountDue: due, status: "PENDING", paystackRef: reference } });
  const email = parent.email ?? `parent-${parent.phone ?? parent.id}@noemail.nazareth-school.ng`;
  const { authorizationUrl } = await initializeTransaction({
    email, amountNaira: due, reference, callbackUrl: `${env().APP_URL}/payments/paystack/callback`,
    metadata: { order: orderNo(order.number), orderId },
  });
  return authorizationUrl;
}

/** Idempotent: safe to call from both the browser callback and the webhook. */
export async function confirmPaystack(reference: string): Promise<{ order: Order | null; status: "approved" | "part" | "failed" | "already" }> {
  const payment = await db.payment.findUnique({ where: { paystackRef: reference }, include: { order: true } });
  if (!payment) return { order: null, status: "failed" };
  if (payment.status !== "PENDING") return { order: payment.order, status: "already" };
  const v = await verifyTransaction(reference);
  if (!v.success || v.currency !== "NGN") {
    await db.payment.update({ where: { id: payment.id }, data: { status: "REJECTED", rejectionReason: "Paystack reported the payment as not successful" } });
    return { order: payment.order, status: "failed" };
  }
  const received = v.amountNaira === -1 ? payment.amountDue : v.amountNaira;
  const res = await db.$transaction(async (tx) => {
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (fresh.status !== "PENDING") return null; // processed by the webhook a moment ago
    await tx.$executeRaw`SELECT 1 FROM "Order" WHERE "id" = ${payment.orderId} FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    const a = await applyReceived(tx, order, received, "Paystack");
    await tx.payment.update({ where: { id: payment.id }, data: { status: a.outcome === "approved" ? "APPROVED" : "PART_PAID", amountReceived: received, verifiedAt: new Date() } });
    return { order, a };
  });
  if (!res) return { order: payment.order, status: "already" };
  await notifyApplied(res.order, res.a, received);
  return { order: res.order, status: res.a.outcome };
}

export async function paymentsSummary() {
  const approved = await db.payment.groupBy({ by: ["method"], where: { status: { in: ["APPROVED", "PART_PAID"] } }, _sum: { amountReceived: true } });
  const sum = (m: Payment["method"]) => approved.find((a) => a.method === m)?._sum.amountReceived ?? 0;
  return { paystack: sum("PAYSTACK"), transfer: sum("TRANSFER"), wallet: sum("WALLET") };
}
