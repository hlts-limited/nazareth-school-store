import Image from "next/image";
import { SchoolFooter } from "@/shared/ui/school-footer";
import { naira, orderNo } from "@/shared/lib/format";
import { SCHOOL } from "@/shared/config/school";
import { Avatar, Card, CardHeader, Empty, Pill } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton, ThemeToggle } from "@/shared/ui/client";
import { IdleWatcher } from "@/shared/ui/shell-client";
import { Icon } from "@/shared/ui/icon";
import { endViewAs, idleInfo, keepAlive, logout, requirePupilActor } from "@/modules/auth";
import { pupilDashboard, toggleWishAction } from "@/modules/cart";
import { ItemArt, itemLook } from "@/modules/catalogue";
import { ORDER_STATUS } from "@/modules/orders";
import { ViewAsBanner } from "@/app/view-as-banner";

export const metadata = { title: "My page" };

/** A pupil's page: their booklist, a wishlist their parents see, and their orders. Pupils can't pay. */
export default async function PupilPage() {
  const { pupil, readOnly, viewAs } = await requirePupilActor();
  const [d, idle] = await Promise.all([pupilDashboard(pupil), idleInfo("PUPIL")]);
  const { progress } = d;
  const pct = progress.required.length ? Math.round((progress.have.length / progress.required.length) * 100) : 100;

  const wishButton = (itemId: string, on: boolean) => (
    <ActionForm action={toggleWishAction} className="inline-form">
      <input type="hidden" name="itemId" value={itemId} />
      <SubmitButton size="sm" variant={on ? "default" : "ghost"} icon={on ? "x" : "heart"} disabled={readOnly}>{on ? "Remove" : "Wish"}</SubmitButton>
    </ActionForm>
  );

  return (
    <>
      {viewAs && <ViewAsBanner name={viewAs.name} expiresAt={viewAs.expiresAt} endAction={endViewAs} />}
      <div className="shell">
        <header className="topbar"><div className="topbar-in">
          <span className="brand"><Image src="/logo.png" alt="" width={36} height={36} /><span><b>{SCHOOL.storeName}</b><small>My page</small></span></span>
          <div className="grow" /><ThemeToggle />
          {!viewAs && <form action={logout}><button className="btn sm" type="submit"><Icon name="logout" size="sm" /> <span className="hide-sm">Sign out</span></button></form>}
        </div></header>
        <main className="main"><div className="stack loose">
          <section className="card pupil-hero">
            <div className="row">
              <Avatar id={pupil.id} first={pupil.firstName} last={pupil.lastName} size="lg" />
              <div className="grow"><h1>Hello, {pupil.firstName}!</h1><p>{d.cls.name} · <span className="mono">{pupil.regNumber}</span></p></div>
              <div className="kpi text-right"><span className="l">My wallet</span><span className="v">{naira(d.wallet)}</span></div>
            </div>
          </section>

          <div className="grid g2 items-start">
            <Card pad={false}>
              <CardHeader title="My booklist" right={<span className="small muted">{progress.have.length} of {progress.required.length} bought</span>} />
              <div className="card-b"><div className={`progress ${pct === 100 ? "ok" : ""}`}><span style={{ width: `${pct}%` }} /></div></div>
              {d.required.map((i) => (
                <div key={i.id} className="cart-line">
                  <ItemArt {...itemLook(i)} size="thumb" />
                  <span className="grow small fw-600">{i.name}</span>
                  {progress.bought.has(i.id) ? <Pill tone="ok">Bought</Pill> : <Pill tone="warn">Not yet</Pill>}
                </div>
              ))}
              {d.required.length === 0 && <Empty title="No booklist yet" />}
            </Card>

            <div className="stack">
              <Card className="stack">
                <div className="row between"><h3>My wishlist</h3><span className="small muted">Your parents see this</span></div>
                {d.wish.length === 0 ? <p className="small muted">Nothing yet. Tap Wish on anything below.</p> : d.wish.map((w) => (
                  <div key={w.itemId} className="row between">
                    <span className="small fw-600">{w.item.name} <span className="muted">{naira(w.item.price)}</span></span>
                    {wishButton(w.itemId, true)}
                  </div>
                ))}
                {d.suggestions.length > 0 && (
                  <>
                    <div className="eyebrow mt-8">You could also ask for</div>
                    {d.suggestions.map((i) => (
                      <div key={i.id} className="row between">
                        <span className="small fw-600">{i.name} <span className="muted">{naira(i.price)}</span></span>
                        {wishButton(i.id, false)}
                      </div>
                    ))}
                  </>
                )}
              </Card>

              <Card pad={false}>
                <CardHeader title="My orders" />
                {d.orders.length === 0 ? <Empty title="No orders yet" /> : d.orders.map((o) => (
                  <div key={o.id} className="order-row static">
                    <div className="grow">
                      <div className="row tight"><b className="mono">{orderNo(o.number)}</b><Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill></div>
                      <div className="small muted">{[...new Set(o.lines.map((l) => l.pileName ?? l.itemName))].join(", ")}</div>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        </div><SchoolFooter /></main>
      </div>
      {!viewAs && <IdleWatcher idleSeconds={idle.idleSeconds} keepAlive={keepAlive} logout={logout} />}
    </>
  );
}
