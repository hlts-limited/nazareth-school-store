"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zText, type ActionResult } from "@/shared/lib/action";
import { naira, orderNo } from "@/shared/lib/format";
import { onlinePaymentsReady } from "@/shared/config/env";
import { auditActor, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { startPaystack } from "@/modules/payments";
import { counterOrder, counterOrderPath, placeCounterOrder } from "./service";

const entries = z.string().transform((s, ctx) => {
  try {
    const v = JSON.parse(s) as unknown;
    const arr = z.array(z.object({ pupilId: z.string().min(1).max(100), variantId: z.string().min(1).max(100), qty: z.number().int().min(0).max(50) })).max(300).parse(v);
    return arr;
  } catch { ctx.addIssue({ code: "custom", message: "Tick at least one item to buy." }); return z.NEVER; }
});

/** Registrar: place a School Store order for a parent at the counter */
export async function placeCounterOrderAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("store.counter");
    const d = parseForm(z.object({ parentId: zText(100), entries }), form);
    const by = { id: v.user.id, name: `${v.user.firstName} ${v.user.lastName}` };
    const order = await placeCounterOrder(d.parentId, d.entries, by);
    await audit(await auditActor(v), "Counter order placed", "Order", order.id, { order: orderNo(order.number), parentId: d.parentId, total: order.subtotal, walletUsed: order.walletUsed });
    return ok(order.status === "PAYMENT_APPROVED" ? `Order ${orderNo(order.number)} placed and paid from the parent's wallet.` : `Order ${orderNo(order.number)} placed. Take the payment of ${naira(order.subtotal - order.walletUsed)} on Paystack.`, { redirect: counterOrderPath(order.number) });
  });
}

/** Open Paystack on the counter's computer for what's still due (the parent's wallet is used first) */
export async function payCounterOrderAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("store.counter");
    const o = await counterOrder(String(form.get("no") ?? ""));
    if (!o) return fail("That counter order wasn't found.");
    if (!onlinePaymentsReady()) return fail("Paystack isn't switched on yet, so payments can't be taken.");
    const url = await startPaystack({ id: o.parentId, email: o.parent.email, phone: o.parent.phone, firstName: o.parent.firstName, lastName: o.parent.lastName }, o.id);
    await audit(await auditActor(v), "Counter payment started", "Order", o.id, { order: orderNo(o.number) });
    return url ? ok(undefined, { redirect: url }) : ok("Paid from the parent's wallet.", { redirect: counterOrderPath(o.number) });
  });
}
