import { NextResponse } from "next/server";
import { confirmPaystack, validSignature } from "@/modules/payments";

/**
 * Paystack webhook. Set this URL in your Paystack dashboard: https://<your-domain>/api/paystack/webhook
 * The signature is checked, then the payment is verified again with Paystack's API before anything is approved.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-paystack-signature"))) return new NextResponse("Invalid signature", { status: 401 });
  let event: { event?: string; data?: { reference?: string } };
  try { event = JSON.parse(raw); } catch { return new NextResponse("Bad JSON", { status: 400 }); }
  if (event.event === "charge.success" && event.data?.reference) {
    try { await confirmPaystack(event.data.reference); } catch (e) { console.error("[paystack webhook]", e); return new NextResponse("Retry", { status: 500 }); }
  }
  return NextResponse.json({ received: true });
}
