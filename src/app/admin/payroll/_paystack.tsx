import { env } from "@/shared/config/env";
import { transferMode } from "@/modules/payments";

/**
 * Shows whether Paystack is connected for paying salaries, and in which mode:
 * green for Live (real money moves), red for Test (no real money moves), grey when no key is set.
 */
export function PaystackStatus() {
  const connected = !!env().PAYSTACK_SECRET_KEY;
  const mode = transferMode();
  const [color, soft, label, title] = !connected
    ? ["var(--muted)", "var(--surface-2)", "Paystack not connected", "No Paystack key is set, so salaries can't be paid through Paystack yet."]
    : mode === "live"
      ? ["var(--ok)", "var(--ok-soft)", "Paystack connected · Live mode", "Live key in use: paying sends real money to staff bank accounts."]
      : ["var(--err)", "var(--err-soft)", "Paystack connected · Test mode", "Test key in use: payments are simulated and no real money moves. Add the live key to pay salaries for real."];
  return (
    <span className="paystack-status" title={title} role="status" style={{ color, background: soft, borderColor: color }}>
      <span className="dot" aria-hidden style={{ background: color }} />
      {label}
    </span>
  );
}
