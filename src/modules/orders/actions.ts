"use server";

import { z } from "zod";
import { orderNo } from "@/shared/lib/format";
import { ok, parseForm, runAction, type ActionResult } from "@/shared/lib/action";
import { auditActor, getViewer, parentForAction } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { cancelByParent, checkout } from "./service";

export async function checkoutAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    const d = parseForm(z.object({
      method: z.enum(["PAYSTACK", "TRANSFER"], { errorMap: () => ({ message: "Choose how you'll pay" }) }),
      useWallet: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v ? (Array.isArray(v) ? v : [v]) : [])),
    }), form);
    const name = `${parent.firstName} ${parent.lastName}`;
    const order = await checkout(parent.id, d.method, d.useWallet, name);
    const v = await getViewer();
    if (v) await audit(await auditActor(v), "Placed order", "Order", order.id, { order: orderNo(order.number), total: order.subtotal });
    const no = orderNo(order.number);
    if (order.status === "PAYMENT_APPROVED") return ok("Paid from wallet. Your order is approved.", { redirect: `/orders/${no}` });
    if (d.method === "PAYSTACK") return ok(undefined, { redirect: `/orders/${no}/pay` });
    return ok(`Order ${no} placed. Transfer the amount shown, then upload your receipt.`, { redirect: `/orders/${no}` });
  });
}

export async function cancelOrderAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    await cancelByParent(parent.id, String(form.get("orderId")), `${parent.firstName} ${parent.lastName}`);
    return ok("Order cancelled. Any money already paid is in your child's wallet.");
  });
}
