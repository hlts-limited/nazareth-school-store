import Link from "next/link";
import { naira } from "@/shared/lib/format";
import { Avatar, Card, Empty, Note, PageHeader } from "@/shared/ui/primitives";
import { ActionForm, SearchParamInput, SubmitButton } from "@/shared/ui/client";
import { requireParentActor } from "@/modules/auth";
import { addBooklistAction, addToCartAction, booklistProgress, getCart } from "@/modules/cart";
import { categoryTree, ItemArt, itemLook, shopItems, variantAvailable } from "@/modules/catalogue";
import { childrenOf } from "@/modules/pupils";
import { AddToCart } from "../_components";

export const metadata = { title: "Shop" };

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ child?: string; cat?: string; q?: string }> }) {
  const sp = await searchParams;
  const { parent, readOnly } = await requireParentActor();
  const kids = await childrenOf(parent.id);
  if (!kids.length) return <Card><Empty title="No children linked yet">Ask the school office to link your children to your phone number.</Empty></Card>;
  const child = kids.find((k) => k.id === sp.child) ?? kids[0];
  const [cats, items, cart, progress] = await Promise.all([
    categoryTree(), shopItems(child.classId, { categoryId: sp.cat, q: sp.q }), getCart(parent.id), booklistProgress(child.id, child.classId),
  ]);
  const inCart = (itemId: string) => cart.lines.filter((l) => l.pupilId === child.id && l.variant.itemId === itemId).reduce((a, l) => a + l.qty, 0);
  const cartItemIds = new Set(cart.lines.filter((l) => l.pupilId === child.id).map((l) => l.variant.itemId));
  const missing = progress.required.filter((r) => !progress.bought.has(r.id) && !cartItemIds.has(r.id));
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ child: child.id, ...(sp.cat ? { cat: sp.cat } : {}), ...(sp.q ? { q: sp.q } : {}) });
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    return `/shop?${p.toString()}`;
  };

  return (
    <>
      <PageHeader title="Shop" sub="Items are filtered to each child's class. Pick-up is at the school store." />
      <div className="stack">
        <div className="for-bar" role="tablist" aria-label="Shopping for">
          {kids.map((k) => (
            <Link key={k.id} href={qs({ child: k.id, q: undefined })} className={k.id === child.id ? "on" : ""} role="tab" aria-selected={k.id === child.id}>
              <Avatar id={k.id} first={k.firstName} last={k.lastName} />
              <span><b>{k.firstName}</b><span>{k.class.name}</span></span>
            </Link>
          ))}
        </div>
        <div className="shop-layout">
          <div className="stack">
            {missing.length > 0 ? (
              <div className="booklist-banner">
                <div><b>{child.firstName}&apos;s {child.class.name} booklist</b><br /><span>{missing.length} required item{missing.length > 1 ? "s" : ""} not bought yet · {naira(missing.reduce((a, i) => a + i.price, 0))}</span></div>
                <ActionForm action={addBooklistAction} className="inline-form">
                  <input type="hidden" name="pupilId" value={child.id} />
                  <SubmitButton icon="plus" disabled={readOnly}>Add full booklist</SubmitButton>
                </ActionForm>
              </div>
            ) : (
              <Note tone="ok" icon="check"><b>{child.firstName}&apos;s required booklist is complete</b> (bought or in your cart).</Note>
            )}
            <div className="row"><SearchParamInput param="q" id="shop-q" placeholder={`Search ${child.class.name} items`} /></div>
            <div className="chips">
              <Link href={qs({ cat: undefined })} className={`chip ${!sp.cat ? "on" : ""}`}>All items</Link>
              {cats.map((c) => (
                <Link key={c.id} href={qs({ cat: c.id })} className={`chip ${sp.cat === c.id ? "on" : ""}`}><span className="dot" style={{ background: c.color }} />{c.name}</Link>
              ))}
            </div>
            {items.length === 0 ? (
              <Card><Empty title="No items match">Try another category or clear the search.</Empty></Card>
            ) : (
              <div className="products">
                {items.map((it) => {
                  const avail = it.variants.reduce((a, v) => a + variantAvailable(v), 0);
                  return (
                    <article key={it.id} className="pcard">
                      <span style={{ position: "relative", display: "block" }}>
                        <ItemArt {...itemLook(it)} />
                        {it.compulsory && <span className="pill ok plain" style={{ position: "absolute", top: 8, left: 8 }}>Required</span>}
                      </span>
                      <div className="pbody">
                        <div className="nm">{it.name}</div>
                        <div className="row between">
                          <span className="pr">{naira(it.price)}</span>
                          {avail <= 0 ? <span className="stock-out">Out of stock</span> : avail <= 5 ? <span className="stock-low">Only {avail} left</span> : null}
                        </div>
                        <AddToCart action={addToCartAction} pupilId={child.id} childName={child.firstName} inCart={inCart(it.id)} readOnly={readOnly}
                          variants={it.variants.map((v) => ({ id: v.id, label: v.label, available: variantAvailable(v) }))} />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
          <aside className="mini-cart card stack">
            <div className="row between"><h3>Your cart</h3>{cart.count > 0 && <span className="pill plain">{cart.count} items</span>}</div>
            {cart.groups.length === 0 ? <p className="muted small">Items you add for any child appear here, grouped by child.</p> : (
              <>
                {cart.groups.map((g) => (
                  <div key={g.pupil.id} className="stat-line"><span className="row tight"><Avatar id={g.pupil.id} first={g.pupil.firstName} last={g.pupil.lastName} size="sm" />{g.pupil.firstName}</span><b>{naira(g.subtotal)}</b></div>
                ))}
                <div className="sum-row total"><span>Total</span><span>{naira(cart.subtotal)}</span></div>
                <Link href="/cart" className="btn primary block">Review cart</Link>
              </>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
