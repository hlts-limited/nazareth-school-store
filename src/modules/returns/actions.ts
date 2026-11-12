"use server";

import { z } from "zod";
import { ok, parseForm, runAction, zInt, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { naira, orderNo } from "@/shared/lib/format";
import { auditActor, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { decideReturn, recordReturn } from "./service";

const who = (v: { user: { id: string; firstName: string; lastName: string } }) => ({ id: v.user.id, name: `${v.user.firstName} ${v.user.lastName}` });

/** Registrar: an item has been brought back to the store */
export async function recordReturnAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("fulfilment.manage");
    const d = parseForm(z.object({
      lineId: zText(100), qty: zInt(1, "Enter how many"), reason: zText(200, "Say why it's being returned"),
      condition: z.enum(["resellable", "damaged"], { errorMap: () => ({ message: "Choose its condition" }) }),
    }), form);
    const r = await recordReturn(d.lineId, d.qty, d.reason, d.condition === "resellable", who(v));
    await audit(await auditActor(v), "Recorded return", "Order", r.order.id, { order: orderNo(r.order.number), qty: d.qty, amount: r.amount, reason: d.reason, condition: d.condition });
    return ok(`Return recorded (${naira(r.amount)}). Accounts will approve it before the parent's wallet is credited.`);
  });
}

/** Accounts: approve (credit the wallet) or decline a recorded return */
export async function decideReturnAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payments.review");
    const d = parseForm(z.object({ id: zText(100), decision: z.enum(["approve", "reject"]), note: zOptText(300) }), form);
    const r = await decideReturn(d.id, d.decision === "approve", d.note, who(v));
    await audit(await auditActor(v), d.decision === "approve" ? "Approved return" : "Declined return", "Order", r.orderId, { amount: r.amount, qty: r.qty, note: d.note });
    return ok(d.decision === "approve" ? `Approved. ${naira(r.amount)} is in the parent's wallet and they've been told.` : "Declined. Nothing was credited.");
  });
}
