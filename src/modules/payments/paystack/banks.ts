import { UserError } from "@/shared/lib/action";
import { API, paystackMock, secretKey } from "./client";

/* Staff bank details: the list of Nigerian banks and the account-name check (HR). */

/** Used when Paystack can't be asked (no key): the common Nigerian banks with Paystack's codes. */
const FALLBACK_BANKS: { code: string; name: string }[] = [
  { code: "044", name: "Access Bank" }, { code: "050", name: "Ecobank Nigeria" }, { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank of Nigeria" }, { code: "214", name: "First City Monument Bank" }, { code: "058", name: "Guaranty Trust Bank" },
  { code: "082", name: "Keystone Bank" }, { code: "50211", name: "Kuda Bank" }, { code: "50515", name: "Moniepoint MFB" },
  { code: "999992", name: "OPay Digital Services" }, { code: "999991", name: "PalmPay" }, { code: "076", name: "Polaris Bank" },
  { code: "221", name: "Stanbic IBTC Bank" }, { code: "232", name: "Sterling Bank" }, { code: "032", name: "Union Bank of Nigeria" },
  { code: "033", name: "United Bank For Africa" }, { code: "035", name: "Wema Bank" }, { code: "057", name: "Zenith Bank" },
];

let bankCache: { at: number; banks: { code: string; name: string }[] } | null = null;

/** Nigerian banks that can receive transfers (Paystack's list, cached for a day). */
export async function listBanks(): Promise<{ code: string; name: string }[]> {
  const key = secretKey();
  if (!key) return FALLBACK_BANKS;
  if (bankCache && Date.now() - bankCache.at < 86_400_000) return bankCache.banks;
  try {
    const r = await fetch(`${API}/bank?country=nigeria&currency=NGN&perPage=100`, { headers: { Authorization: `Bearer ${key}` } });
    const j = (await r.json()) as { status: boolean; data?: { code: string; name: string; active: boolean }[] };
    if (!r.ok || !j.status || !j.data?.length) return FALLBACK_BANKS;
    const banks = j.data.filter((b) => b.active).map((b) => ({ code: b.code, name: b.name })).sort((a, b) => a.name.localeCompare(b.name));
    bankCache = { at: Date.now(), banks };
    return banks;
  } catch {
    return FALLBACK_BANKS;
  }
}

/**
 * The account holder's name from Paystack's account check. null = can't check here (no key, or Paystack is
 * unavailable), so the name must be typed and checked by Accounts. Throws a UserError for a wrong number.
 */
export async function resolveAccount(accountNumber: string, bankCode: string): Promise<string | null> {
  if (paystackMock()) return `TEST ACCOUNT ${accountNumber.slice(-4)}`;
  const key = secretKey();
  if (!key) return null;
  let r: Response;
  try {
    r = await fetch(`${API}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, { headers: { Authorization: `Bearer ${key}` } });
  } catch {
    return null;
  }
  const j = (await r.json().catch(() => ({}))) as { status?: boolean; data?: { account_name: string } };
  if (r.ok && j.status && j.data?.account_name) return j.data.account_name;
  if (r.status >= 500) return null;
  throw new UserError("That account number doesn't match the bank. Check both and try again.", { accountNumber: "Not found at this bank" });
}
