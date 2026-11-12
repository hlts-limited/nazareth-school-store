import { createHmac, timingSafeEqual } from "node:crypto";
import { env, isProd } from "@/shared/config/env";

/*
 * Paystack is used for three separate things, each in its own file so a change to one can't affect the others:
 *   checkout.ts  - parents paying online (store orders, admission form fees)
 *   banks.ts     - the bank list and account-name checks for staff bank details
 *   transfers.ts - paying salaries by bank transfer
 * This file holds what they share: the API address, the key, development simulation and webhook signatures.
 */

export const API = "https://api.paystack.co";

/** Without a secret key (development only) the store uses a simulated checkout. */
export const paystackMock = () => !env().PAYSTACK_SECRET_KEY && !isProd();

/** Can people pay online right now? (a real key, or the simulated checkout in development) */
export { onlinePaymentsReady as paystackReady } from "@/shared/config/env";

export const secretKey = () => env().PAYSTACK_SECRET_KEY;

/** Webhook signature: HMAC-SHA512 of the raw body with the secret key */
export function validSignature(rawBody: string, signature: string | null) {
  const key = env().PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
