import Link from "next/link";
import { naira, orderNo } from "@/shared/lib/format";
import { Avatar, Card, CardHeader, Empty, LinkButton, PageHeader } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { requireParentActor } from "@/modules/auth";
import { addBooklistAction, addToCartAction, booklistProgress, wishlistForParent } from "@/modules/cart";
import { amountDue, ordersForParent } from "@/modules/orders";
import { OrderRow } from "../_order-row";
import { childrenOf } from "@/modules/pupils";
import { balances } from "@/modules/wallet";
import { getSettings } from "@/modules/settings";

export const metadata = { title: "Home" };

function greet() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function ParentHome() {
  const { parent, readOnly } = await requireParentActor();
  const [kids, orders, wish, settings] = await Promise.all([childrenOf(parent.id), ordersForParent(parent.id, 20), wishlistForParent(parent.id), getSettings()]);
  const [bal, progress] = await Promise.all([balances(kids.map((k) => k.id)), Promise.all(kids.map((k) => booklistProgress(k.id, k.classId)))]);

  type Alert = { tone: "warn" | "err" | "ok" | "info"; icon: string; title: string; sub: string; href: string; cta: string };
  const alerts: Alert[] = [];
  for (const o of orders) {
    const no = orderNo(o.number), href = `/orders/${no}`;
    if (o.status === "PENDING_PAYMENT" && o.method === "TRANSFER") alerts.push({ tone: "warn", icon: "upload", title: `Upload your transfer receipt for ${no}`, sub: `${naira(amountDue(o))} to ${settings.bank.bankName} · ${settings.bank.accountNumber}`, href, cta: "Upload" });
    if (o.status === "PENDING_PAYMENT" && o.method === "PAYSTACK") alerts.push({ tone: "warn", icon: "card", title: `Finish paying for ${no}`, sub: `${naira(amountDue(o))} due`, href, cta: "Pay" });
    if (o.status === "PART_PAID") alerts.push({ tone: "err", icon: "alert", title: `Balance due on ${no}: ${naira(amountDue(o))}`, sub: `We received ${naira(o.amountReceived)} of ${naira(o.subtotal - o.walletUsed)}.`, href, cta: "Pay balance" });
    if (o.status === "PAYMENT_REJECTED") alerts.push({ tone: "err", icon: "alert", title: `Receipt for ${no} was not accepted`, sub: o.rejectReason ?? "", href, cta: "Fix" });
    if (o.status === "READY" || o.status === "PARTIALLY_HANDED_OUT") alerts.push({ tone: "ok", icon: "box", title: `${no} is ready for pick-up`, sub: `Show code ${o.pickupCode} at the school store.`, href, cta: "View code" });
    if (o.status === "AWAITING_VERIFICATION") alerts.push({ tone: "info", icon: "clock", title: `Payment for ${no} is being checked`, sub: "The accounts office usually confirms within one working day.", href, cta: "Track" });
  }

  return (
    <>
      <PageHeader title={`${greet()}, ${parent.firstName}`} sub={`${kids.length} ${kids.length === 1 ? "child" : "children"} at Nazareth School · ${settings.currentTerm}`}
        actions={kids.length ? <LinkButton href="/shop" variant="primary" icon="shop">Shop for all children</LinkButton> : undefined} />
      <div className="stack loose">
        {alerts.length > 0 && (
          <section className="stack tight">
            <div className="eyebrow">Needs your attention</div>
            <div className="alert-list">
              {alerts.map((a, i) => (
                <div key={i} className={`alert-item ${a.tone}`}>
                  <span className="ic"><Icon name={a.icon} /></span>
                  <div className="grow"><b>{a.title}</b><div className="small muted">{a.sub}</div></div>
                  <Link className="btn sm" href={a.href}>{a.cta}</Link>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="stack tight">
          <div className="eyebrow">Your children</div>
          {kids.length === 0 ? (
            <Card><Empty title="No children linked yet">Ask the school office to link your children to this phone number.</Empty></Card>
          ) : (
            <div className="grid g3">
              {kids.map((k, i) => {
                const p = progress[i];
                const pct = p.required.length ? Math.round((p.have.length / p.required.length) * 100) : 100;
                return (
                  <article key={k.id} className="card child-card">
                    <div className="top">
                      <Avatar id={k.id} first={k.firstName} last={k.lastName} size="lg" />
                      <div className="meta grow"><b>{k.firstName} {k.lastName}</b><span className="small muted">{k.class.name} · <span className="mono">{k.regNumber}</span></span></div>
                    </div>
                    <div className="stack tight">
                      <div className="stat-line"><span>Booklist</span><b>{p.have.length} of {p.required.length} items</b></div>
                      <div className={`progress ${pct === 100 ? "ok" : ""}`}><span style={{ width: `${pct}%` }} /></div>
                      <div className="stat-line"><span>Wallet balance</span><b>{naira(bal[k.id] ?? 0)}</b></div>
                    </div>
                    <div className="row">
                      <LinkButton href={`/shop?child=${k.id}`} variant="primary" size="sm">Shop for {k.firstName}</LinkButton>
                      {p.have.length < p.required.length && (
                        <ActionForm action={addBooklistAction} className="inline-form">
                          <input type="hidden" name="pupilId" value={k.id} />
                          <SubmitButton size="sm" variant="default" disabled={readOnly}>Add full booklist</SubmitButton>
                        </ActionForm>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {wish.length > 0 && (
          <Card className="stack tight">
            <div className="row between"><h3>Wishlist from your children</h3><span className="small muted">Added in the pupil dashboard</span></div>
            {wish.map((w) => (
              <div key={`${w.pupilId}-${w.itemId}`} className="row between">
                <span>{w.pupil.firstName} wants <b>{w.item.name}</b> · {naira(w.item.price)}</span>
                {w.item.hasVariants ? (
                  <LinkButton href={`/shop?child=${w.pupilId}&q=${encodeURIComponent(w.item.name)}`} size="sm">Choose size</LinkButton>
                ) : (
                  <ActionForm action={addToCartAction} className="inline-form">
                    <input type="hidden" name="pupilId" value={w.pupilId} /><input type="hidden" name="variantId" value={w.item.variants[0]?.id ?? ""} />
                    <SubmitButton size="sm" variant="default" disabled={readOnly}>Add to cart</SubmitButton>
                  </ActionForm>
                )}
              </div>
            ))}
          </Card>
        )}

        <Card pad={false}>
          <CardHeader title="Recent orders" right={<Link className="btn ghost sm" href="/orders">All orders <Icon name="chev" size="sm" /></Link>} />
          {orders.length === 0 ? <Empty title="No orders yet">Start with {kids[0]?.firstName ?? "your child"}&apos;s booklist.</Empty> : orders.slice(0, 4).map((o) => <OrderRow key={o.id} o={o} />)}
        </Card>
      </div>
    </>
  );
}
