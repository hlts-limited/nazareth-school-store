import Link from "next/link";
import { naira } from "@/shared/lib/format";
import { Avatar, Card, Empty, LinkButton, PageHeader } from "@/shared/ui/primitives";
import { Icon } from "@/shared/ui/icon";
import { requireParentActor } from "@/modules/auth";
import { getCart, setQtyAction } from "@/modules/cart";
import { ItemArt, itemLook } from "@/modules/catalogue";
import { checkoutAction } from "@/modules/orders";
import { getSettings } from "@/modules/settings";
import { CheckoutBox, QtyControl } from "../_components";

export const metadata = { title: "Cart" };

export default async function CartPage() {
  const { parent, readOnly } = await requireParentActor();
  const [cart, settings] = await Promise.all([getCart(parent.id), getSettings()]);
  if (!cart.lines.length) {
    return (
      <>
        <PageHeader title="Cart" />
        <Card><Empty title="Your cart is empty" action={<LinkButton href="/shop" variant="primary">Start shopping</LinkButton>}>Add items for any of your children, then check out once.</Empty></Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Cart" sub="One checkout for all your children. Each child's items are packed and tracked separately." />
      <div className="cart-layout">
        <div className="stack">
          {cart.groups.map((g) => (
            <section key={g.pupil.id} className="card cart-group">
              <div className="card-h">
                <div className="row"><Avatar id={g.pupil.id} first={g.pupil.firstName} last={g.pupil.lastName} /><div><b>{g.pupil.firstName} {g.pupil.lastName}</b><div className="small muted">{g.pupil.class.name}</div></div></div>
                <b className="tnum">{naira(g.subtotal)}</b>
              </div>
              {g.lines.map((l) => {
                const it = l.variant.item;
                const price = l.variant.priceOverride ?? it.price;
                if (it.isPile) {
                  return (
                    <div key={l.id} className="cart-line">
                      <ItemArt {...itemLook(it)} size="thumb" />
                      <div className="grow">
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{it.name} <span className="pill violet plain">{it.pileParts.length} books</span></div>
                        <div className="small muted">{it.pileParts.map((pt) => `${pt.qty > 1 ? `${pt.qty} × ` : ""}${pt.book.name}`).join(" · ")}</div>
                      </div>
                      <b className="tnum hide-sm" style={{ minWidth: 78, textAlign: "right" }}>{naira(price)}</b>
                      <QtyControl action={setQtyAction} id={l.id} qty={l.qty} readOnly={readOnly} removeOnly />
                    </div>
                  );
                }
                return (
                  <div key={l.id} className="cart-line">
                    <ItemArt {...itemLook(it)} size="thumb" />
                    <div className="grow"><div style={{ fontWeight: 600, fontSize: 13.5 }}>{it.name}</div><div className="small muted">{l.variant.label !== "Standard" ? `${l.variant.label} · ` : ""}{naira(price)} each</div></div>
                    <b className="tnum hide-sm" style={{ minWidth: 78, textAlign: "right" }}>{naira(price * l.qty)}</b>
                    <QtyControl action={setQtyAction} id={l.id} qty={l.qty} readOnly={readOnly} />
                  </div>
                );
              })}
            </section>
          ))}
          <Link className="btn ghost" href="/shop" style={{ alignSelf: "flex-start" }}><Icon name="plus" size="sm" /> Add more items</Link>
        </div>
        <aside style={{ position: "sticky", top: 84 }}>
          <CheckoutBox action={checkoutAction} subtotal={cart.subtotal} autoCancelHours={settings.autoCancelHours} readOnly={readOnly}
            wallets={cart.groups.map((g) => ({ pupilId: g.pupil.id, name: g.pupil.firstName, balance: g.walletBalance, groupTotal: g.subtotal }))} />
        </aside>
      </div>
    </>
  );
}
