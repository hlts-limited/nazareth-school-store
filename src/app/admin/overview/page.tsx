import { naira } from "@/shared/lib/format";
import { Bars, Card, PageHeader } from "@/shared/ui/primitives";
import { ScanChart, StatTile, TimerTile } from "@/shared/ui/charts";
import { requireStaff } from "@/modules/auth";
import { adminOverview, salesTrend } from "@/modules/reports";
import { upcomingEvents } from "@/modules/website";

export const metadata = { title: "School overview" };

export default async function SchoolOverview() {
  await requireStaff("reports.view");
  const [o, trend, [next]] = await Promise.all([adminOverview(), salesTrend(30), upcomingEvents(1)]);
  const daily = trend.labels.map((_, i) => trend.series.reduce((a, s) => a + s.values[i], 0));
  const month = daily.reduce((a, b) => a + b, 0);
  const cancelled = (trend.bars ?? []).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader title="School overview" sub="Store sales, orders and families at a glance." />
      <div className="stack loose">
        <div className="ov-tiles">
          <StatTile label="Paid sales" value={o.sales} format="naira" sub={`${naira(month)} in the last 30 days`} spark={daily.slice(-14)} />
          <StatTile label="Orders" value={o.orders} sub="All time" />
          <StatTile label="Families" value={o.families} sub="With a child at school" />
          <StatTile label="Signed in now" value={o.sessions} sub="Active sessions" />
          <TimerTile icon="clock" label={next ? `Next event · ${next.title}` : "Next event"} until={next?.startsAt.toISOString() ?? null} empty="None planned" />
        </div>
        <ScanChart
          title="Store sales · last 30 days"
          labels={trend.labels} series={trend.series} markers={trend.markers} warn={trend.warn} bars={trend.bars} barsLabel="Cancelled orders"
          format="naira" empty="No paid orders in the last 30 days."
          summary={`Paid store sales in the last 30 days: ${naira(month)} across ${trend.series.length} classes. ${cancelled} orders cancelled.`}
        />
        <div className="grid g2" style={{ alignItems: "start" }}>
          <Card className="stack"><h3>Orders by status</h3><Bars rows={o.byStatus.map(([l, n]) => [l, n, String(n)])} /></Card>
          <Card className="stack"><h3>Paid sales by class</h3><Bars color="var(--ink)" rows={o.byClass.map(([l, n]) => [l, n, naira(n)])} /></Card>
        </div>
      </div>
    </>
  );
}
