"use server";

import { z } from "zod";
import { orderNo } from "@/shared/lib/format";
import { fail, ok, parseForm, runAction, type ActionResult } from "@/shared/lib/action";
import { onlinePaymentsReady } from "@/shared/config/env";
import { auditActor, getViewer, parentForAction } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { cancelByParent, checkout } from "./service";

export async function checkoutAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    const d = parseForm(z.object({
      // Store orders are paid online with Paystack (or from the wallet). Bank transfer is no longer offered.
      method: z.literal("PAYSTACK", { errorMap: () => ({ message: "Pay online with Paystack" }) }).default("PAYSTACK"),
      useWallet: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v ? (Array.isArray(v) ? v : [v]) : [])),
    }), form);
    if (!onlinePaymentsReady()) return fail("Online payment isn't switched on yet. Please try again later, or contact the school.");
    const name = `${parent.firstName} ${parent.lastName}`;
    const order = await checkout(parent.id, d.method, d.useWallet, name);
    const v = await getViewer();
    if (v) await audit(await auditActor(v), "Placed order", "Order", order.id, { order: orderNo(order.number), total: order.subtotal });
    const no = orderNo(order.number);
    if (order.status === "PAYMENT_APPROVED") return ok("Paid from wallet. Your order is approved.", { redirect: `/orders/${no}` });
    return ok(undefined, { redirect: `/orders/${no}/pay` });
  });
}

export async function cancelOrderAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const parent = await parentForAction();
    await cancelByParent(parent.id, String(form.get("orderId")), `${parent.firstName} ${parent.lastName}`);
    return ok("Order cancelled. Any money already paid is in your child's wallet.");
  });
}
