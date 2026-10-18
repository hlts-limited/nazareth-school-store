import Link from "next/link";
import { Card, CardHeader, LinkButton, PageHeader, Pill } from "@/shared/ui/primitives";
import { Ruler, ScanChart, StatTile, TimerTile } from "@/shared/ui/charts";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { lowStock, recordStockMovement } from "@/modules/inventory";
import { storeOverview, storeTrend } from "@/modules/reports";
import { StockDialog } from "../_components";

export const metadata = { title: "Store" };

export default async function StoreHome() {
  await requireStaff("catalogue.manage");
  const [ov, low, trend] = await Promise.all([storeOverview(), lowStock(12), storeTrend(30)]);
  const sold = trend.series.reduce((a, s) => a + s.values.reduce((x, y) => x + y, 0), 0);
  const health = trend.tracked ? Math.round((trend.healthy / trend.tracked) * 100) : null;
  return (
    <>
      <PageHeader title="Overview" sub="Stock and fulfilment at a glance." actions={<LinkButton href="/admin/store/items/new" variant="primary" icon="plus">Add item</LinkButton>} />
      <div className="stack loose">
        <div className="ov-tiles">
          <StatTile label="Paid, not packed" value={ov.toPack} warn={ov.toPack > 0} sub="Ready to start packing" />
          <StatTile label="Being packed" value={ov.packing} />
          <StatTile label="Waiting for pick-up" value={ov.ready} />
          <StatTile label="Low or out of stock" value={low.length} warn={low.length > 0} sub="At or below the reorder level" />
          <TimerTile icon="box" label="Oldest order waiting for pick-up" since={ov.ready ? trend.oldestReady?.toISOString() ?? null : null} warnAfterHours={72} empty="Nothing waiting" />
        </div>
        <ScanChart
          title="Items sold · last 30 days"
          labels={trend.labels} series={trend.series} markers={trend.markers}
          empty="No items sold in the last 30 days."
          summary={`${sold} items sold in paid orders in the last 30 days, by category.`}
        />
        <Ruler label="Stock health" value={health} target={90}
          sub={trend.tracked ? `${trend.healthy} of ${trend.tracked} items and sizes are above their reorder level` : undefined} empty="No stock tracked yet" />
        <Card pad={false}>
          <CardHeader title="Low stock" right={<Link className="btn ghost sm" href="/admin/store/stock">Manage stock <Icon name="chev" size="sm" /></Link>} />
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Item</th><th>Size</th><th className="r">Available</th><th className="r">Reorder at</th><th /></tr></thead>
            <tbody>
              {low.map((v) => (
                <tr key={v.id}>
                  <td data-label="Item">{v.item.name}</td><td data-label="Size">{v.label === "Standard" ? "—" : v.label}</td>
                  <td data-label="Available" className="r tnum">{v.available <= 0 ? <Pill tone="err">Out</Pill> : <b style={{ color: "var(--warn)" }}>{v.available}</b>}</td>
                  <td data-label="Reorder at" className="r tnum">{v.item.reorderLevel}</td>
                  <td data-label="" className="r"><StockDialog action={recordStockMovement} item={v.item.name} label="Restock" variants={[{ id: v.id, label: v.label, onHand: v.onHand, reserved: v.reserved }]} /></td>
                </tr>
              ))}
              {low.length === 0 && <tr><td colSpan={5}><div className="empty">Everything is above its reorder level.</div></td></tr>}
            </tbody>
          </table></div>
        </Card>
      </div>
    </>
  );
}
