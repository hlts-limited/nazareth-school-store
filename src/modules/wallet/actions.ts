"use server";

import { z } from "zod";
import { ok, parseForm, runAction, zInt, zText, type ActionResult } from "@/shared/lib/action";
import { db } from "@/shared/lib/db";
import { naira } from "@/shared/lib/format";
import { auditActor, parentForAction, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { adjust, moveExcess } from "./service";

export async function moveExcessAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    const d = parseForm(z.object({ txId: zText(100), toPupilId: zText(100) }), form);
    await moveExcess(d.txId, d.toPupilId, parent.id, `${parent.firstName} ${parent.lastName}`);
    const p = await db.pupil.findUnique({ where: { id: d.toPupilId } });
    return ok(`Kept in ${p?.firstName}'s wallet.`);
  });
}

export async function adjustWalletAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("wallets.adjust");
    const d = parseForm(z.object({ pupilId: zText(100), kind: z.enum(["credit", "debit", "refund"]), amount: zInt(1, "Enter an amount"), reason: zText(200, "Enter a reason") }), form);
    await adjust(d.pupilId, d.kind, d.amount, d.reason, `${v.user.firstName} ${v.user.lastName}`);
    await audit(await auditActor(v), d.kind === "refund" ? "Wallet refund" : "Wallet adjustment", "Pupil", d.pupilId, { kind: d.kind, amount: d.amount, reason: d.reason });
    return ok(`Saved: ${d.kind === "credit" ? "+" : "−"}${naira(d.amount)}. Logged in the audit trail.`);
  });
}
