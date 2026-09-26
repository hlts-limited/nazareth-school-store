import Link from "next/link";
import { naira } from "@/shared/lib/format";
import { Card, Empty, LinkButton, PageHeader, Pill } from "@/shared/ui/primitives";
import { SearchParamInput } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { categoryTree, ItemArt, itemAvailable, itemLook, listClasses, listItems, pileStock } from "@/modules/catalogue";
import { recordStockMovement } from "@/modules/inventory";
import { StockDialog } from "../../_components";

export const metadata = { title: "Items" };

export default async function ItemsPage({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string }> }) {
  await requireStaff("catalogue.manage");
  const sp = await searchParams;
  const [cats, items, classes] = await Promise.all([categoryTree(), listItems({ categoryId: sp.cat, q: sp.q }), listClasses()]);
  const total = cats.reduce((a, c) => a + c.totalItems, 0);
  return (
    <>
      <PageHeader title="Items" sub={`${total} items in ${cats.length} categories`} actions={<LinkButton href="/admin/store/items/new" variant="primary" icon="plus">Add item</LinkButton>} />
      <div className="stack">
        <div className="row"><SearchParamInput param="q" id="ri-q" placeholder="Search by name or SKU" /></div>
        <div className="chips">
          <Link href={`/admin/store/items${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ""}`} className={`chip ${!sp.cat ? "on" : ""}`}>All <span className="muted">{total}</span></Link>
          {cats.map((c) => <Link key={c.id} href={`/admin/store/items?cat=${c.id}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} className={`chip ${sp.cat === c.id ? "on" : ""}`}><span className="dot" style={{ background: c.color }} />{c.name} <span className="muted">{c.totalItems}</span></Link>)}
        </div>
        <Card pad={false}>
          {items.length === 0 ? <Empty title="No items match" /> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th /><th>Item</th><th>SKU</th><th>Category</th><th>Classes</th><th className="r">Price</th><th className="r">Available</th><th /></tr></thead>
              <tbody>
                {items.map((it) => {
                  const a = itemAvailable(it);
                  const req = it.classes.some((c) => c.isCompulsory);
                  const href = it.isPile ? `/admin/store/piles/${it.id}` : `/admin/store/items/${it.id}`;
                  const ps = it.isPile ? pileStock(it) : null;
                  return (
                    <tr key={it.id} style={it.isActive ? undefined : { opacity: 0.55 }}>
                      <td className="cb" data-label=""><span className="cart-line" style={{ padding: 0, border: 0 }}><ItemArt {...itemLook(it)} size="thumb" /></span></td>
                      <td data-label="Item"><Link href={href} className="link-row"><b>{it.name}</b></Link>{it.isPile && <> <Pill tone="violet" dot={false}>Pile · {it.pileParts.length} books</Pill></>}{req && <> <Pill tone="ok" dot={false}>Required</Pill></>}{!it.isActive && <> <Pill>Hidden</Pill></>}{it.hasVariants && <div className="tiny muted">{it.variants.length} sizes</div>}
                        {it.inPiles[0] && <div className="tiny muted">Only sold in <Link href="/admin/store/piles">{it.inPiles[0].pile.name}</Link></div>}</td>
                      <td data-label="SKU" className="mono small">{it.sku}</td>
                      <td data-label="Category">{it.category.parent ? `${it.category.parent.name} › ` : ""}{it.category.name}</td>
                      <td data-label="Classes" className="small">{it.classes.length === classes.length ? "All classes" : it.classes.map((c) => c.class.name).join(", ")}</td>
                      <td data-label="Price" className="r tnum">{naira(it.price)}</td>
                      <td data-label="Available" className="r tnum">{ps ? <span className="small">{ps.inStock}/{ps.total} books</span> : a <= 0 ? <Pill tone="err">Out</Pill> : a <= it.reorderLevel ? <b style={{ color: "var(--warn)" }}>{a}</b> : a}</td>
                      <td data-label="" className="r"><div className="row tight" style={{ justifyContent: "flex-end" }}>
                        {!it.isPile && <StockDialog action={recordStockMovement} item={it.name} variants={it.variants.map((v) => ({ id: v.id, label: v.label, onHand: v.onHand, reserved: v.reserved }))} />}
                        <Link className="btn sm ghost" href={href}>Edit</Link>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </Card>
      </div>
    </>
  );
}
