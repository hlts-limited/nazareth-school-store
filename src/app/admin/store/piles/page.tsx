import Link from "next/link";
import { naira } from "@/shared/lib/format";
import { Card, CardHeader, Empty, LinkButton, PageHeader, Pill } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { listClasses, listPiles, pileStock, variantAvailable } from "@/modules/catalogue";
import { awaitingByVariant, recordStockMovement } from "@/modules/inventory";
import { StockDialog } from "../../_components";

export const metadata = { title: "Core-textbook piles" };

export default async function PilesPage() {
  await requireStaff("catalogue.manage");
  const [piles, classes] = await Promise.all([listPiles(), listClasses()]);
  const waiting = await awaitingByVariant(piles.flatMap((p) => p.pileParts.map((pt) => pt.book.variants[0]?.id).filter(Boolean) as string[]));
  return (
    <>
      <PageHeader title="Core-textbook piles" sub="Parents buy each pile as one item. Every book inside keeps its own stock, restocks and movement log."
        actions={<LinkButton href="/admin/store/piles/new" variant="primary" icon="plus">New pile</LinkButton>} />
      <div className="stack loose">
        {piles.length === 0 && (
          <Card><Empty title="No piles yet" action={<LinkButton href="/admin/store/piles/new" variant="primary" icon="plus">New pile</LinkButton>}>
            Add each textbook under <b>Items</b> first, then group the compulsory ones into a pile for each class.
          </Empty></Card>
        )}
        {piles.map((p) => {
          const s = pileStock(p);
          const req = p.classes.some((c) => c.isCompulsory);
          return (
            <Card key={p.id} pad={false}>
              <CardHeader
                title={<span><b>{p.name}</b>{req && <> <Pill tone="ok" dot={false}>Required</Pill></>}{!p.isActive && <> <Pill>Hidden</Pill></>}
                  <span className="small muted" style={{ display: "block", fontWeight: 400 }}>
                    {p.classes.length === classes.length ? "All classes" : p.classes.map((c) => c.class.name).join(", ")} · {p.pileParts.length} book{p.pileParts.length === 1 ? "" : "s"} · <span className="mono">{p.sku}</span>
                  </span></span>}
                right={<div className="row tight"><b className="tnum">{naira(p.price)}</b>
                  {s.inStock === s.total ? <Pill tone="ok">All in stock</Pill> : <Pill tone="warn">{s.total - s.inStock} of {s.total} short</Pill>}
                  <Link className="btn sm" href={`/admin/store/piles/${p.id}`}>Edit</Link></div>} />
              <div className="tbl-wrap"><table className="t rt">
                <thead><tr><th>Book</th><th>SKU</th><th className="r">Per pile</th><th className="r">Price</th><th className="r">On hand</th><th className="r">Reserved</th><th className="r">Available</th><th className="r">Waiting for stock</th><th /></tr></thead>
                <tbody>
                  {p.pileParts.map((pt) => {
                    const v = pt.book.variants[0];
                    const avail = v ? variantAvailable(v) : 0;
                    const wait = v ? waiting[v.id] ?? 0 : 0;
                    return (
                      <tr key={pt.id}>
                        <td data-label="Book"><Link href={`/admin/store/items/${pt.bookId}`} className="link-row"><b>{pt.book.name}</b></Link></td>
                        <td data-label="SKU" className="mono small">{pt.book.sku}</td>
                        <td data-label="Per pile" className="r tnum">{pt.qty}</td>
                        <td data-label="Price" className="r tnum">{naira(pt.book.price * pt.qty)}</td>
                        <td data-label="On hand" className="r tnum">{v?.onHand ?? 0}</td>
                        <td data-label="Reserved" className="r tnum">{v?.reserved ?? 0}</td>
                        <td data-label="Available" className="r tnum">{avail < pt.qty ? <Pill tone="err">{avail}</Pill> : avail <= pt.book.reorderLevel ? <b style={{ color: "var(--warn)" }}>{avail}</b> : avail}</td>
                        <td data-label="Waiting" className="r tnum">{wait ? <b style={{ color: "var(--warn)" }}>{wait}</b> : <span className="muted">0</span>}</td>
                        <td data-label="" className="r">{v && <StockDialog action={recordStockMovement} item={pt.book.name} variants={[{ id: v.id, label: v.label, onHand: v.onHand, reserved: v.reserved }]} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </Card>
          );
        })}
        {piles.length > 0 && <p className="small muted"><b>Waiting for stock</b> = copies ordered in a pile while the book was out of stock. They&apos;re packed once you restock and mark them ready in <Link href="/admin/store/packing">Orders to pack</Link>.</p>}
      </div>
    </>
  );
}
