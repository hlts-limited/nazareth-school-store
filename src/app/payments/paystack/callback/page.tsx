import Link from "next/link";
import { orderNo } from "@/shared/lib/format";
import { confirmPaystack } from "@/modules/payments";

export const metadata = { title: "Payment" };

/** Paystack sends the parent back here. We confirm with Paystack's API before approving anything. */
export default async function PaystackCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const sp = await searchParams;
  const ref = sp.reference ?? sp.trxref ?? "";
  const r = ref ? await confirmPaystack(ref) : { order: null, status: "failed" as const };
  const no = r.order ? orderNo(r.order.number) : null;
  const good = r.status === "approved" || r.status === "already";
  return (
    <main className="main mw-520">
      <div className="card empty">
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: good ? "var(--ok-soft)" : "var(--err-soft)", color: good ? "var(--ok)" : "var(--err)", display: "grid", placeItems: "center", margin: "0 auto 12px", fontSize: 26, fontWeight: 800 }}>{good ? "✓" : "!"}</div>
        <h3>{good ? "Payment successful" : r.status === "part" ? "Part payment received" : "Payment not completed"}</h3>
        <p>{good ? `Order ${no} is approved. We'll message you when it's ready for pick-up.` : r.status === "part" ? `We received part of the amount for ${no}. The balance is shown on the order.` : "The card was not charged, or the payment was cancelled. You can try again from the order."}</p>
        {/* Paid at the school counter: back to the counter, not the parent's own page */}
        <div className="mt-14">{no && r.order?.placedById ? <Link className="btn primary" href={`/admin/store/counter/${no}`}>Back to the counter</Link>
          : no ? <Link className="btn primary" href={`/orders/${no}`}>View order</Link> : <Link className="btn primary" href="/orders">Your orders</Link>}</div>
      </div>
    </main>
  );
}
