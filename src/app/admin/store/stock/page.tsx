import { fmtDateTime } from "@/shared/lib/format";
import { Card, CardHeader, Empty, PageHeader } from "@/shared/ui/primitives";
import { SearchParamInput } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { recentMovements, recordStockMovement, stockLevels } from "@/modules/inventory";
import { StockDialog } from "../_widgets";
import { DataTable } from "@/shared/ui/data-table";
import { keyed } from "@/shared/ui/table-cells";

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
        <div className="row mw-460"><SearchParamInput param="q" id="rs-q" placeholder="Search items" /></div>
        <div className="grid g2 items-start">
          <Card pad={false}>
            <CardHeader title="Levels" />
            <DataTable
              empty="No items match" pageSize={40}
              columns={[{ label: "Item", sortable: true }, { label: "Size" }, { label: "On hand", right: true, sortable: true }, { label: "Reserved", right: true, sortable: true }, { label: "Available", right: true, sortable: true }, { label: "", right: true }]}
              rows={levels.map((v) => {
                const avail = Math.max(0, v.onHand - v.reserved);
                return {
                  id: v.id,
                  sort: [v.item.name, v.label, v.onHand, v.reserved, avail, null],
                  cells: keyed([
                    <b key="n" className="small">{v.item.name}</b>, v.label === "Standard" ? "—" : v.label,
                    <span key="o" className="tnum">{v.onHand}</span>, <span key="r" className="tnum muted">{v.reserved}</span>, <b key="a" className="tnum">{avail}</b>,
                    <StockDialog key="d" action={recordStockMovement} item={v.item.name} label="Adjust" variants={[{ id: v.id, label: v.label, onHand: v.onHand, reserved: v.reserved }]} />,
                  ]),
                };
              })}
            />
          </Card>
          <Card pad={false}>
            <CardHeader title="Movements" right={<span className="small muted">Every change is recorded</span>} />
            {moves.length === 0 ? <Empty title="No movements yet" /> : moves.map((m) => (
              <div key={m.id} className="order-row static">
                <div className="grow"><b className="small">{m.variant.item.name}{m.variant.label !== "Standard" ? ` (${m.variant.label})` : ""}</b>
                  <div className="tiny muted">{fmtDateTime(m.createdAt)} · {TYPE[m.type]} · {m.reason ?? "—"} · {m.by}</div></div>
                <b className={`tnum ${m.qty > 0 ? "c-ok" : "c-err"}`}>{m.qty > 0 ? "+" : ""}{m.qty}</b>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
