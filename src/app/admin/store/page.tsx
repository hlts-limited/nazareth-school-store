import Link from "next/link";
import { Card, CardHeader, Kpi, LinkButton, PageHeader, Pill } from "@/shared/ui/primitives";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { lowStock, recordStockMovement } from "@/modules/inventory";
import { storeOverview } from "@/modules/reports";
import { StockDialog } from "../_components";

export const metadata = { title: "Store" };

export default async function StoreHome() {
  await requireStaff("catalogue.manage");
  const [ov, low] = await Promise.all([storeOverview(), lowStock(12)]);
  return (
    <>
      <PageHeader title="Overview" sub="Stock and fulfilment at a glance." actions={<LinkButton href="/admin/store/items/new" variant="primary" icon="plus">Add item</LinkButton>} />
      <div className="stack loose">
        <div className="grid g4">
          <Kpi label="Paid, not packed" value={ov.toPack} />
          <Kpi label="Being packed" value={ov.packing} />
          <Kpi label="Waiting for pick-up" value={ov.ready} />
          <Kpi label="Low or out of stock" value={low.length} tone={low.length ? "warn" : undefined} />
        </div>
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
