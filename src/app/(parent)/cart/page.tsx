import Link from "next/link";
import { naira } from "@/shared/lib/format";
import { Avatar, Card, Empty, LinkButton, PageHeader } from "@/shared/ui/primitives";
import { Icon } from "@/shared/ui/icon";
import { requireParentActor } from "@/modules/auth";
import { getCart, setQtyAction, type Cart } from "@/modules/cart";
import { ItemArt, itemLook } from "@/modules/catalogue";
import { checkoutAction } from "@/modules/orders";
import { getSettings } from "@/modules/settings";
import { paystackReady } from "@/modules/payments";
import { CheckoutBox, QtyControl } from "../_components";

export const metadata = { title: "Cart" };

/** Where the parent is in checkout: 1 check items, 2 choose wallet and pay, 3 Paystack */
function Steps({ at }: { at: 1 | 2 }) {
  return (
    <div className="steps-mini" aria-label="Checkout steps">
      <span className={at === 1 ? "on" : ""}>1 · Check items</span>
      <span className={at === 2 ? "on" : ""}>2 · Payment</span>
      <span>3 · Pay on Paystack</span>
    </div>
  );
}

function ItemsByChild({ cart, readOnly }: { cart: Cart; readOnly: boolean }) {
  return (
    <>
      {cart.groups.map((g) => (
        <section key={g.pupil.id} className="card cart-group">
          <div className="card-h">
            <div className="row"><Avatar id={g.pupil.id} first={g.pupil.firstName} last={g.pupil.lastName} /><div><b>{g.pupil.firstName} {g.pupil.lastName}</b><div className="small muted">{g.pupil.class.name}</div></div></div>
            <b className="tnum">{naira(g.subtotal)}</b>
          </div>
          {g.lines.map((l) => {
            const it = l.variant.item;
            const price = l.variant.priceOverride ?? it.price;
            return (
              <div key={l.id} className="cart-line">
                <ItemArt {...itemLook(it)} size="thumb" />
                {it.isPile ? (
                  <div className="grow">
                    <div className="line-name">{it.name} <span className="pill violet plain">Pile</span></div>
                    {it.description && <div className="small muted">{it.description}</div>}
                  </div>
                ) : (
                  <div className="grow"><div className="line-name">{it.name}</div><div className="small muted">{l.variant.label !== "Standard" ? `${l.variant.label} · ` : ""}{naira(price)} each</div></div>
                )}
                <b className="tnum hide-sm price-col">{naira(price * l.qty)}</b>
                <QtyControl action={setQtyAction} id={l.id} qty={l.qty} readOnly={readOnly} removeOnly={it.isPile} />
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

export default async function CartPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { parent, readOnly } = await requireParentActor();
  const [cart, settings, { step }] = await Promise.all([getCart(parent.id), getSettings(), searchParams]);
  if (!cart.lines.length) {
    return (
      <>
        <PageHeader title="Cart" />
        <Card><Empty title="Your cart is empty" action={<LinkButton href="/shop" variant="primary">Start shopping</LinkButton>}>Add items for any of your children, then check out once.</Empty></Card>
      </>
    );
  }

  // Step 2: what each child's items cost, which wallets to use, and the Paystack button
  if (step === "pay") {
    return (
      <>
        <PageHeader title="Payment" sub="Your wallet is used first. Anything left is paid securely on Paystack." />
        <Steps at={2} />
        <div className="cart-layout">
          <Card className="stack">
            <div className="row between"><h3>Your order</h3><Link className="btn ghost sm" href="/cart"><Icon name="back" size="sm" /> Change items</Link></div>
            {cart.groups.map((g) => (
              <div key={g.pupil.id} className="sum-row">
                <span><b>{g.pupil.firstName}</b> <span className="muted">· {g.lines.reduce((a, l) => a + l.qty, 0)} item{g.lines.length === 1 && g.lines[0].qty === 1 ? "" : "s"}</span></span>
                <span className="tnum">{naira(g.subtotal)}</span>
              </div>
            ))}
            <div className="sum-row total"><span>Total</span><span className="tnum">{naira(cart.subtotal)}</span></div>
            <p className="tiny muted">Each child&apos;s items are packed and tracked separately. You&apos;ll get a WhatsApp message when they are ready for pick-up.</p>
          </Card>
          <aside className="cart-aside">
            <CheckoutBox action={checkoutAction} subtotal={cart.subtotal} autoCancelHours={settings.autoCancelHours} readOnly={readOnly} paystack={paystackReady()} wallet={cart.wallet} />
          </aside>
        </div>
      </>
    );
  }

  // Step 1: check and change the items
  return (
    <>
      <PageHeader title="Cart" sub="One checkout for all your children." />
      <Steps at={1} />
      <div className="cart-layout">
        <div className="stack">
          <ItemsByChild cart={cart} readOnly={readOnly} />
          <Link className="btn ghost self-start" href="/shop"><Icon name="plus" size="sm" /> Add more items</Link>
        </div>
        <aside className="cart-aside">
          <Card className="stack">
            <h3>Summary</h3>
            <div className="sum-row"><span className="muted">{cart.count} item{cart.count === 1 ? "" : "s"}</span><span className="tnum">{naira(cart.subtotal)}</span></div>
            <LinkButton href="/cart?step=pay" variant="primary" size="lg" block>Continue to payment</LinkButton>
            {cart.fromWallet > 0 && <div className="sum-row"><span className="muted">From your wallet</span><span className="tnum c-ok">−{naira(cart.fromWallet)}</span></div>}
            {cart.fromWallet > 0 && <div className="sum-row total"><span>To pay</span><span className="tnum">{naira(cart.subtotal - cart.fromWallet)}</span></div>}
          </Card>
        </aside>
      </div>
    </>
  );
}
