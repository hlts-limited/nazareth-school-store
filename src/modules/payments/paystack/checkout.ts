import { UserError } from "@/shared/lib/action";
import { API, paystackMock, secretKey } from "./client";

/* Parents paying online: store orders (payments/service.ts) and admission form fees (admissions). */

export async function initializeTransaction(opts: { email: string; amountNaira: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> }) {
  if (paystackMock()) return { authorizationUrl: `${opts.callbackUrl}?reference=${encodeURIComponent(opts.reference)}&mock=1` };
  const key = secretKey();
  if (!key) throw new UserError("Online payment isn't available yet. Please try again later, or contact the school.");
  const r = await fetch(`${API}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: opts.email, amount: opts.amountNaira * 100, currency: "NGN", reference: opts.reference, callback_url: opts.callbackUrl, metadata: opts.metadata }),
  });
  const j = (await r.json()) as { status: boolean; message: string; data?: { authorization_url: string } };
  if (!r.ok || !j.status || !j.data) throw new Error(`Paystack: ${j.message}`);
  return { authorizationUrl: j.data.authorization_url };
}

/** Ask Paystack directly whether a payment succeeded — never trust the browser redirect alone. */
export async function verifyTransaction(reference: string): Promise<{ success: boolean; amountNaira: number; currency: string }> {
  if (paystackMock()) return { success: true, amountNaira: -1, currency: "NGN" }; // -1 = "whatever was due"
  const r = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secretKey()}` } });
  const j = (await r.json()) as { status: boolean; data?: { status: string; amount: number; currency: string } };
  if (!r.ok || !j.status || !j.data) return { success: false, amountNaira: 0, currency: "NGN" };
  return { success: j.data.status === "success", amountNaira: Math.round(j.data.amount / 100), currency: j.data.currency };
}
