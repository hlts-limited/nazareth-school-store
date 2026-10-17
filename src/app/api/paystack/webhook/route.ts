import { NextResponse } from "next/server";
import { confirmPaystack, validSignature } from "@/modules/payments";
import { confirmApplicationFee, isApplicationFeeRef } from "@/modules/admissions";
import { applyTransferResult } from "@/modules/payroll";

/**
 * Paystack webhook. Set this URL in your Paystack dashboard: https://<your-domain>/api/paystack/webhook
 * The signature is checked, then the payment is verified again with Paystack's API before anything is approved.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-paystack-signature"))) return new NextResponse("Invalid signature", { status: 401 });
  let event: { event?: string; data?: { reference?: string; reason?: string } };
  try { event = JSON.parse(raw); } catch { return new NextResponse("Bad JSON", { status: 400 }); }
  if (event.event === "charge.success" && event.data?.reference) {
    const ref = event.data.reference;
    try { await (isApplicationFeeRef(ref) ? confirmApplicationFee(ref) : confirmPaystack(ref)); } catch (e) { console.error("[paystack webhook]", e); return new NextResponse("Retry", { status: 500 }); }
  }
  // Salary transfers: success, failure or reversal of one payment
  const t = { "transfer.success": "SUCCESS", "transfer.failed": "FAILED", "transfer.reversed": "REVERSED" } as const;
  if (event.event && event.event in t && event.data?.reference?.startsWith("nzs_sal_")) {
    try { await applyTransferResult(event.data.reference, t[event.event as keyof typeof t], event.data.reason); } catch (e) { console.error("[paystack webhook transfer]", e); return new NextResponse("Retry", { status: 500 }); }
  }
  return NextResponse.json({ received: true });
}
