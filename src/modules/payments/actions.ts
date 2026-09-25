"use server";

import { z } from "zod";
import { db } from "@/shared/lib/db";
import { fail, ok, parseForm, runAction, zInt, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { naira, orderNo } from "@/shared/lib/format";
import { readUpload } from "@/shared/lib/storage";
import { auditActor, parentForAction, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { approveTransfer, payFromWallet, rejectTransfer, startPaystack, submitReceipt } from "./service";

export async function uploadReceiptAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    const d = parseForm(z.object({
      orderId: zText(100), amount: zInt(1, "Enter the amount you sent"), bankName: zText(60, "Choose your bank"),
      transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the transfer date"),
    }), form);
    const file = form.get("receipt") as File | null;
    const up = await readUpload(file, { allowPdf: true });
    if ("error" in up) return fail(up.error!, { receipt: up.error! });
    await submitReceipt(parent.id, d.orderId, { buf: up.buf, mime: up.mime, ext: up.ext, name: file?.name ?? "receipt" }, { bankName: d.bankName, amount: d.amount, transferDate: new Date(`${d.transferDate}T12:00:00+01:00`) }, `${parent.firstName} ${parent.lastName}`);
    return ok("Receipt sent to the accounts office. We'll text you when it's checked.");
  });
}

export async function approvePaymentAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payments.review");
    const d = parseForm(z.object({ paymentId: zText(100), received: zInt(0, "Enter the amount received") }), form);
    const { order, a } = await approveTransfer(d.paymentId, d.received, { id: v.user.id, name: `${v.user.firstName} ${v.user.lastName}` });
    await audit(await auditActor(v), a.outcome === "approved" ? "Approved payment" : "Confirmed part payment", "Order", order.id, { order: orderNo(order.number), received: d.received, excess: a.excess, balance: a.balance });
    return ok(a.outcome === "approved"
      ? `${orderNo(order.number)} approved${a.excess ? ` · ${naira(a.excess)} credited to wallet` : ""}.`
      : `${orderNo(order.number)} marked part paid. The parent has been told the ${naira(a.balance)} balance.`);
  });
}

export async function rejectPaymentAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payments.review");
    const d = parseForm(z.object({ paymentId: zText(100), reason: zText(200, "Choose a reason"), note: zOptText(300) }), form);
    const reason = d.note ? `${d.reason} — ${d.note}` : d.reason;
    const order = await rejectTransfer(d.paymentId, reason, { id: v.user.id, name: `${v.user.firstName} ${v.user.lastName}` });
    await audit(await auditActor(v), "Rejected payment", "Order", order.id, { order: orderNo(order.number), reason });
    return ok(`${orderNo(order.number)} rejected. The parent has been notified.`);
  });
}

export async function payFromWalletAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    await payFromWallet(parent.id, String(form.get("orderId")), `${parent.firstName} ${parent.lastName}`);
    return ok("Paid from your children's wallets. Your order is approved.");
  });
}

export async function startPaystackAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    const order = await db.order.findFirst({ where: { id: String(form.get("orderId")), parentId: parent.id } });
    if (!order) return fail("Order not found.");
    const url = await startPaystack(parent, order.id);
    return ok(undefined, { redirect: url });
  });
}
