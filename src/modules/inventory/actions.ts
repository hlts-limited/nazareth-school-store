"use server";

import { z } from "zod";
import { ok, parseForm, runAction, zInt, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { db } from "@/shared/lib/db";
import { staffFor, auditActor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { recordMovement } from "./service";

export async function recordStockMovement(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("stock.manage");
    const d = parseForm(z.object({
      variantId: zText(100), type: z.enum(["restock", "damaged", "found", "return"]), qty: zInt(1, "Enter a quantity of 1 or more"), reason: zOptText(200),
    }), form);
    const signed = d.type === "damaged" ? -d.qty : d.qty;
    const type = d.type === "restock" ? "RESTOCK" : d.type === "return" ? "RETURN" : "ADJUSTMENT";
    const reason = d.reason ?? { restock: "Delivery received", damaged: "Damaged / lost", found: "Found in stock-take", return: "Returned by parent" }[d.type];
    await recordMovement(d.variantId, type, signed, reason, v.user.id);
    const variant = await db.itemVariant.findUnique({ where: { id: d.variantId }, include: { item: true } });
    await audit(await auditActor(v), "Stock movement", "ItemVariant", d.variantId, { item: variant?.item.name, variant: variant?.label, qty: signed, reason });
    return ok(`Stock updated: ${signed > 0 ? "+" : ""}${signed} ${variant?.item.name ?? ""}${variant && variant.label !== "Standard" ? ` (${variant.label})` : ""}.`);
  });
}
