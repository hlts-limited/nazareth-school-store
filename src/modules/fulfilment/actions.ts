"use server";

import { z } from "zod";
import { db } from "@/shared/lib/db";
import { ok, parseForm, runAction, zText, type ActionResult } from "@/shared/lib/action";
import { orderNo } from "@/shared/lib/format";
import { auditActor, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { handOut, lineNowReady, markReady, setLinePacked, startPacking } from "./service";

const name = (v: { user: { firstName: string; lastName: string } }) => `${v.user.firstName} ${v.user.lastName}`;

export async function startPackingAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("fulfilment.manage");
    const id = String(form.get("orderId"));
    await startPacking(id, name(v));
    await audit(await auditActor(v), "Started packing", "Order", id);
    return ok("Packing started. Untick anything you can't supply yet.");
  });
}

export async function setLinePackedAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await staffFor("fulfilment.manage");
    await setLinePacked(String(form.get("lineId")), form.get("packed") === "on");
    return ok();
  });
}

export async function markReadyAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("fulfilment.manage");
    const o = await markReady(String(form.get("orderId")), name(v));
    await audit(await auditActor(v), "Marked ready for pick-up", "Order", o.id, { order: orderNo(o.number) });
    return ok(`${orderNo(o.number)} is ready. The parent has been sent pick-up code ${o.pickupCode}.`);
  });
}

export async function lineReadyAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("fulfilment.manage");
    await lineNowReady(String(form.get("lineId")), name(v));
    return ok("Marked ready. The parent has been told.");
  });
}

export async function handOutAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("fulfilment.manage");
    const d = parseForm(z.object({
      orderId: zText(100), collectedBy: zText(120, "Enter who collected the items"), relationship: zText(40),
      lineIds: z.union([z.string(), z.array(z.string())]).optional().transform((x) => (x ? (Array.isArray(x) ? x : [x]) : [])),
    }), form);
    const r = await handOut(d.orderId, d.lineIds, d.collectedBy, d.relationship, { id: v.user.id, name: name(v) });
    const o = await db.order.findUnique({ where: { id: d.orderId } });
    await audit(await auditActor(v), "Handed out", "Order", d.orderId, { order: o ? orderNo(o.number) : undefined, items: r.count, collectedBy: d.collectedBy });
    return ok(`${r.count} item${r.count > 1 ? "s" : ""} handed out to ${d.collectedBy}.`, { redirect: "/admin/store/pickup" });
  });
}
