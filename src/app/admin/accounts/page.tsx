import Link from "next/link";
import { naira, orderNo } from "@/shared/lib/format";
import { Card, Note, PageHeader } from "@/shared/ui/primitives";
import { Glass, Ruler, ScanChart, StatTile, TimerTile } from "@/shared/ui/charts";
import { requireStaff } from "@/modules/auth";
import { paymentsSummary, reviewQueue } from "@/modules/payments";
import { accountsOverview, moneyTrend } from "@/modules/reports";
import { totalHeld } from "@/modules/wallet";
import { getSettings } from "@/modules/settings";

export const metadata = { title: "Accounts" };

export default async function AccountsHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireStaff("payments.review");
  const { denied } = await searchParams;
  const [ov, sums, held, queue, settings, trend] = await Promise.all([accountsOverview(), paymentsSummary(), totalHeld(), reviewQueue(), getSettings(), moneyTrend(30)]);
  const daily = trend.labels.map((_, i) => trend.series.reduce((a, s) => a + s.values[i], 0));
  const month = daily.reduce((a, b) => a + b, 0);
  const rejected = (trend.bars ?? []).reduce((a, b) => a + b, 0);
  const total = sums.paystack + sums.transfer + sums.wallet;
  return (
    <>
      {denied && <div style={{ marginBottom: 16 }}><Note tone="warn">You don&apos;t have permission for that page.</Note></div>}
      <PageHeader title="Overview" sub={settings.currentTerm} />
      <div className="stack loose">
        <div className="ov-tiles">
          <StatTile label="Money received" value={total} format="naira" sub={`${naira(month)} in the last 30 days`} spark={daily.slice(-14)} />
          <StatTile label="Payments to review" value={ov.queue} warn={ov.queue > 0} sub={ov.queue ? "Receipts waiting for a decision" : "All clear"} />
          <StatTile label="Part-paid orders" value={ov.partPaid} sub={`${naira(ov.outstanding)} outstanding`} />
          <StatTile label="Held in pupil wallets" value={held} format="naira" sub="Owed to parents" />
          <TimerTile icon="receipt" label="Oldest receipt waiting" since={ov.oldest?.toISOString() ?? null} warnAfterHours={24} empty="Nothing waiting" />
        </div>
        <ScanChart
          title="Money received · last 30 days"
          labels={trend.labels} series={trend.series} markers={trend.markers} warn={trend.warn} bars={trend.bars} barsLabel="Rejected payments"
          format="naira" empty="No payments approved in the last 30 days."
          summary={`Money received in the last 30 days: ${naira(month)}, split by Paystack, bank transfer and wallet. ${rejected} payments rejected.`}
          right={<Link className="btn sm" href="/admin/accounts/review">Review queue</Link>}
        />
        <div className="ov-side">
          <Ruler label="Receipts checked within 24 h" value={trend.reviewedIn24h} target={90}
            sub={trend.reviewed ? `${trend.reviewed} bank transfer${trend.reviewed === 1 ? "" : "s"} checked in the last 30 days` : undefined} empty="No receipts checked yet" />
          <Glass title="Received by method">
            <div className="glass-list">
              {[["Paystack", sums.paystack], ["Bank transfer", sums.transfer], ["Wallet", sums.wallet]].map(([l, v]) => (
                <div key={l as string}><span>{l}</span><span className="tnum">{naira(v as number)}</span><i style={{ width: `${total ? ((v as number) / total) * 100 : 0}%` }} /></div>
              ))}
            </div>
          </Glass>
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
