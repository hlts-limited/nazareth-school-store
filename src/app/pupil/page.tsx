import Image from "next/image";
import { naira, orderNo } from "@/shared/lib/format";
import { SCHOOL } from "@/shared/config/school";
import { Avatar, Card, CardHeader, Empty, Pill } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton, ThemeToggle } from "@/shared/ui/client";
import { IdleWatcher } from "@/shared/ui/shell-client";
import { Icon } from "@/shared/ui/icon";
import { endViewAs, idleInfo, keepAlive, logout, requirePupilActor } from "@/modules/auth";
import { booklistProgress, toggleWishAction } from "@/modules/cart";
import { ItemArt, itemLook, listItems } from "@/modules/catalogue";
import { ORDER_STATUS, ordersForPupil } from "@/modules/orders";
import { balance } from "@/modules/wallet";
import { db } from "@/shared/lib/db";
import { ViewAsBanner } from "@/app/view-as-banner";

export const metadata = { title: "Pupil dashboard" };

export default async function PupilPage() {
  const { pupil, readOnly, viewAs } = await requirePupilActor();
  const cls = await db.class.findUniqueOrThrow({ where: { id: pupil.classId } });
  const [progress, orders, bal, extras, wish, idle] = await Promise.all([
    booklistProgress(pupil.id, pupil.classId), ordersForPupil(pupil.id), balance(pupil.id),
    listItems({ classId: pupil.classId, activeOnly: true, take: 40 }),
    db.wishlistItem.findMany({ where: { pupilId: pupil.id } }), idleInfo("PUPIL"),
  ]);
  const required = await db.item.findMany({ where: { id: { in: progress.required.map((r) => r.id) } }, include: { category: { include: { parent: true } } }, orderBy: { name: "asc" } });
  const wishIds = new Set(wish.map((w) => w.itemId));
  const optional = extras.filter((i) => !i.classes.find((c) => c.classId === pupil.classId)?.isCompulsory).slice(0, 8);
  const pct = progress.required.length ? Math.round((progress.have.length / progress.required.length) * 100) : 100;

  return (
    <>
      {viewAs && <ViewAsBanner name={viewAs.name} expiresAt={viewAs.expiresAt} endAction={endViewAs} />}
      <div className="shell">
        <header className="topbar"><div className="topbar-in">
          <span className="brand"><Image src="/logo.png" alt="" width={36} height={36} /><span><b>{SCHOOL.storeName}</b><small>Pupil dashboard</small></span></span>
          <div className="grow" /><ThemeToggle />
          {!viewAs && <form action={logout}><button className="btn sm" type="submit"><Icon name="logout" size="sm" /> <span className="hide-sm">Sign out</span></button></form>}
        </div></header>
        <main className="main"><div className="stack loose">
          <section className="card" style={{ background: "var(--ink)", borderColor: "var(--ink)", color: "var(--surface)" }}>
            <div className="row" style={{ gap: 16 }}>
              <Avatar id={pupil.id} first={pupil.firstName} last={pupil.lastName} size="lg" />
              <div className="grow"><h1 style={{ color: "var(--surface)" }}>Hello, {pupil.firstName}!</h1><p style={{ opacity: 0.75 }}>{cls.name} · <span className="mono">{pupil.regNumber}</span></p></div>
              <div className="kpi" style={{ textAlign: "right" }}><span className="l" style={{ color: "inherit", opacity: 0.7 }}>My wallet</span><span className="v">{naira(bal)}</span></div>
            </div>
          </section>
          <div className="grid g2" style={{ alignItems: "start" }}>
            <Card pad={false}>
              <CardHeader title="My booklist" right={<span className="small muted">{progress.have.length} of {progress.required.length} bought</span>} />
              <div className="card-b"><div className={`progress ${pct === 100 ? "ok" : ""}`}><span style={{ width: `${pct}%` }} /></div></div>
              {required.map((i) => (
                <div key={i.id} className="cart-line">
                  <ItemArt {...itemLook(i)} size="thumb" />
                  <span className="grow small" style={{ fontWeight: 600 }}>{i.name}</span>
                  {progress.bought.has(i.id) ? <Pill tone="ok">Bought</Pill> : <Pill tone="warn">Not yet</Pill>}
                </div>
              ))}
              {required.length === 0 && <Empty title="No booklist yet" />}
            </Card>
            <div className="stack">
              <Card pad={false}>
                <CardHeader title="My orders" />
                {orders.length === 0 ? <Empty title="No orders yet" /> : orders.map((o) => (
                  <div key={o.id} className="order-row" style={{ cursor: "default" }}>
                    <div className="grow">
                      <div className="row tight"><b className="mono">{orderNo(o.number)}</b><Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill></div>
                      <div className="small muted">{o.lines.map((l) => l.itemName).join(", ")}</div>
                    </div>
                  </div>
                ))}
              </Card>
              <Card className="stack">
                <div className="row between"><h3>Ask a parent to buy</h3><span className="small muted">Pupils can&apos;t pay</span></div>
                <p className="small muted">Add items to your wishlist. Your parent sees them on their dashboard.</p>
                <div className="stack tight">
                  {optional.map((i) => (
                    <ActionForm key={i.id} action={toggleWishAction} className="row between">
                      <input type="hidden" name="itemId" value={i.id} />
                      <span className="small" style={{ fontWeight: 600 }}>{i.name} <span className="muted">{naira(i.price)}</span></span>
                      <SubmitButton size="sm" variant={wishIds.has(i.id) ? "default" : "ghost"} icon="heart" disabled={readOnly}>{wishIds.has(i.id) ? "On wishlist" : "Wish"}</SubmitButton>
                    </ActionForm>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div></main>
      </div>
      {!viewAs && <IdleWatcher idleSeconds={idle.idleSeconds} keepAlive={keepAlive} logout={logout} />}
    </>
  );
}
