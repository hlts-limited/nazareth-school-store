import Link from "next/link";
import { fmtDate, naira, orderNo } from "@/shared/lib/format";
import { Bars, Card, Kpi, Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { paymentsSummary, reviewQueue } from "@/modules/payments";
import { accountsOverview } from "@/modules/reports";
import { totalHeld } from "@/modules/wallet";
import { getSettings } from "@/modules/settings";

export const metadata = { title: "Accounts" };

export default async function AccountsHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireStaff("payments.review");
  const { denied } = await searchParams;
  const [ov, sums, held, queue, settings] = await Promise.all([accountsOverview(), paymentsSummary(), totalHeld(), reviewQueue(), getSettings()]);
  const total = sums.paystack + sums.transfer + sums.wallet;
  return (
    <>
      {denied && <div style={{ marginBottom: 16 }}><Note tone="warn">You don&apos;t have permission for that page.</Note></div>}
      <PageHeader title="Overview" sub={settings.currentTerm} />
      <div className="stack loose">
        <div className="grid g4">
          <Kpi label="Payments to review" value={ov.queue} sub={ov.oldest ? `Oldest waiting since ${fmtDate(ov.oldest)}` : "All clear"} />
          <Kpi label="Money received" value={naira(total)} sub="Paystack, transfers and wallets" />
          <Kpi label="Part-paid orders" value={ov.partPaid} sub={`${naira(ov.outstanding)} outstanding`} />
          <Kpi label="Held in pupil wallets" value={naira(held)} sub="Owed to parents" />
        </div>
        <div className="grid g2" style={{ alignItems: "start" }}>
          <Card className="stack"><h3>Received by method</h3><Bars rows={[["Paystack", sums.paystack, naira(sums.paystack)], ["Bank transfer", sums.transfer, naira(sums.transfer)], ["Wallet", sums.wallet, naira(sums.wallet)]]} /></Card>
          <Card className="stack">
            <div className="row between"><h3>Review queue</h3><Link className="btn sm primary" href="/admin/accounts/review">Open queue</Link></div>
            {queue.length === 0 ? <p className="muted">Nothing waiting.</p> : queue.slice(0, 8).map((q) => (
              <div key={q.order.id} className="row between small">
                <span><b className="mono">{orderNo(q.order.number)}</b> · {q.order.parent.firstName} {q.order.parent.lastName}</span>
                <span className="tnum">{naira(q.receipt?.amountClaimed ?? 0)} of {naira(q.due)}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
