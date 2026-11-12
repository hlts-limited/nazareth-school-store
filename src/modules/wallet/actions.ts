"use server";

import { z } from "zod";
import { ok, parseForm, runAction, zInt, zText, type ActionResult } from "@/shared/lib/action";
import { naira } from "@/shared/lib/format";
import { auditActor, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { adjust } from "./service";

export async function adjustWalletAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("wallets.adjust");
    const d = parseForm(z.object({ parentId: zText(100), kind: z.enum(["credit", "debit", "refund"]), amount: zInt(1, "Enter an amount"), reason: zText(200, "Enter a reason") }), form);
    await adjust(d.parentId, d.kind, d.amount, d.reason, `${v.user.firstName} ${v.user.lastName}`);
    await audit(await auditActor(v), d.kind === "refund" ? "Wallet refund" : "Wallet adjustment", "User", d.parentId, { kind: d.kind, amount: d.amount, reason: d.reason });
    return ok(`Saved: ${d.kind === "credit" ? "+" : "−"}${naira(d.amount)}. Logged in the audit trail.`);
  });
}
