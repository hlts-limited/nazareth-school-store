import { fmtDateTime } from "@/shared/lib/format";
import { Card, CardHeader, Empty, PageHeader } from "@/shared/ui/primitives";
import { SearchParamInput } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { recentMovements, recordStockMovement, stockLevels } from "@/modules/inventory";
import { StockDialog } from "../../_components";

export const metadata = { title: "Stock" };

const TYPE: Record<string, string> = { RESTOCK: "Restock", SALE: "Handed out", ADJUSTMENT: "Adjustment", RETURN: "Return" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff("stock.manage");
  const { q } = await searchParams;
  const [levels, moves] = await Promise.all([stockLevels(q), recentMovements(40)]);
  return (
    <>
      <PageHeader title="Stock" sub="On hand is what's physically in the store. Reserved is held for unpaid or not-yet-collected orders." />
      <div className="stack">
        <div className="row" style={{ maxWidth: 460 }}><SearchParamInput param="q" id="rs-q" placeholder="Search items" /></div>
        <div className="grid g2" style={{ alignItems: "start" }}>
          <Card pad={false}>
            <CardHeader title="Levels" />
            <div className="tbl-wrap" style={{ maxHeight: 620, overflow: "auto" }}><table className="t rt">
              <thead><tr><th>Item</th><th>Size</th><th className="r">On hand</th><th className="r">Reserved</th><th className="r">Available</th><th /></tr></thead>
              <tbody>
                {levels.map((v) => (
                  <tr key={v.id}>
                    <td data-label="Item" className="small"><b>{v.item.name}</b></td><td data-label="Size" className="small">{v.label === "Standard" ? "—" : v.label}</td>
                    <td data-label="On hand" className="r tnum">{v.onHand}</td><td data-label="Reserved" className="r tnum muted">{v.reserved}</td>
                    <td data-label="Available" className="r tnum"><b>{Math.max(0, v.onHand - v.reserved)}</b></td>
                    <td data-label="" className="r"><StockDialog action={recordStockMovement} item={v.item.name} label="Adjust" variants={[{ id: v.id, label: v.label, onHand: v.onHand, reserved: v.reserved }]} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
          <Card pad={false}>
            <CardHeader title="Movements" right={<span className="small muted">Every change is recorded</span>} />
            {moves.length === 0 ? <Empty title="No movements yet" /> : moves.map((m) => (
              <div key={m.id} className="order-row" style={{ cursor: "default" }}>
                <div className="grow"><b className="small">{m.variant.item.name}{m.variant.label !== "Standard" ? ` (${m.variant.label})` : ""}</b>
                  <div className="tiny muted">{fmtDateTime(m.createdAt)} · {TYPE[m.type]} · {m.reason ?? "—"} · {m.by}</div></div>
                <b className="tnum" style={{ color: m.qty > 0 ? "var(--ok)" : "var(--err)" }}>{m.qty > 0 ? "+" : ""}{m.qty}</b>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
