import { UserError } from "@/shared/lib/action";
import { API, paystackMock, secretKey } from "./client";

/* Paying salaries by bank transfer (payroll/pay.ts). */

/** "live" with a live secret key, "test" with a test key, "mock" in development without a key (transfers are simulated). */
export function transferMode(): "live" | "test" | "mock" {
  const key = secretKey();
  if (!key) return paystackMock() ? "mock" : "test";
  return key.startsWith("sk_live_") ? "live" : "test";
}

async function ps<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const key = secretKey();
  if (!key) throw new UserError("Salary payments need the school's Paystack secret key. Ask whoever manages the hosting to add PAYSTACK_SECRET_KEY.");
  const r = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const j = (await r.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!r.ok || !j.status) throw new UserError(`Paystack: ${j.message ?? `request failed (${r.status})`}`);
  return j.data as T;
}

/** The school's Paystack balance in kobo (NGN). */
export async function paystackBalanceKobo(): Promise<number> {
  if (transferMode() === "mock") return 50_000_000_00;
  const d = await ps<{ currency: string; balance: number }[]>("/balance");
  return d.find((b) => b.currency === "NGN")?.balance ?? 0;
}

/** Paystack's fee for one NGN transfer, in kobo: ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above. */
export const transferFeeKobo = (amountKobo: number) => (amountKobo <= 5_000_00 ? 10_00 : amountKobo <= 50_000_00 ? 25_00 : 50_00);

/** A transfer recipient for a bank account (reused while the account doesn't change). */
export async function createTransferRecipient(name: string, accountNumber: string, bankCode: string): Promise<string> {
  if (transferMode() === "mock") return `RCP_mock_${accountNumber.slice(-4)}`;
  const d = await ps<{ recipient_code: string }>("/transferrecipient", { method: "POST", body: { type: "nuban", name, account_number: accountNumber, bank_code: bankCode, currency: "NGN" } });
  return d.recipient_code;
}

export type TransferResult = { reference: string; status: "PENDING" | "SUCCESS" | "FAILED"; transferCode?: string; reason?: string };

/** Up to 100 transfers in one bulk request. Each has its own reference, so a retried request can't pay twice. */
export async function bulkTransfer(transfers: { amountKobo: number; recipient: string; reference: string; reason: string }[]): Promise<TransferResult[]> {
  if (transfers.length > 100) throw new Error("At most 100 transfers per batch");
  if (transferMode() === "mock") return transfers.map((t) => ({ reference: t.reference, status: "SUCCESS", transferCode: `TRF_mock_${t.reference.slice(-6)}` }));
  const d = await ps<{ reference: string; status: string; transfer_code: string }[]>("/transfer/bulk", {
    method: "POST", body: { currency: "NGN", source: "balance", transfers: transfers.map((t) => ({ amount: t.amountKobo, recipient: t.recipient, reference: t.reference, reason: t.reason })) },
  });
  return transfers.map((t) => {
    const x = d.find((y) => y.reference === t.reference);
    return { reference: t.reference, transferCode: x?.transfer_code, status: x?.status === "success" ? "SUCCESS" : x?.status === "failed" ? "FAILED" : "PENDING" };
  });
}

/** Ask Paystack how a transfer went (for the Refresh button). */
export async function verifyTransfer(reference: string): Promise<TransferResult> {
  if (transferMode() === "mock") return { reference, status: "SUCCESS" };
  const d = await ps<{ status: string; transfer_code: string; reason?: string }>(`/transfer/verify/${encodeURIComponent(reference)}`);
  const status = d.status === "success" ? "SUCCESS" : d.status === "failed" || d.status === "reversed" ? "FAILED" : "PENDING";
  return { reference, status, transferCode: d.transfer_code, reason: d.reason };
}
