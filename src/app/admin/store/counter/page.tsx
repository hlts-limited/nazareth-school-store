import Link from "next/link";
import { fmtDateTime, naira, orderNo } from "@/shared/lib/format";
import { Card, CardHeader, Empty, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { SearchParamInput } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { counterFamily, counterOrderPath, counterOrders, findPupilsForCounter, placeCounterOrderAction } from "@/modules/counter";
import { ORDER_STATUS } from "@/modules/orders";
import { CounterBasket } from "./_basket";

export const metadata = { title: "Counter order" };

/**
 * For parents who can't buy online: find the child, tick what to buy for them (and their brothers and sisters),
 * place the order, then take the payment on Paystack at the desk. It's packed and collected like any order.
 */
export default async function CounterPage({ searchParams }: { searchParams: Promise<{ q?: string; parent?: string; find?: string }> }) {
  await requireStaff("store.counter");
  const sp = await searchParams;
  const family = sp.parent ? await counterFamily(sp.parent, sp.find).catch(() => null) : null;
  const [found, lists] = await Promise.all([!family && sp.q ? findPupilsForCounter(sp.q) : Promise.resolve([]), family ? Promise.resolve(null) : counterOrders()]);

  if (family) {
    const p = family.parent;
    return (
      <div className="mw-1080">
        <PageHeader title={`Counter order for ${p.firstName} ${p.lastName}`} sub={<>{p.phone ?? "No phone"} · {family.children.length} child{family.children.length === 1 ? "" : "ren"} at the school</>}
          actions={<Link className="btn" href="/admin/store/counter"><Icon name="back" size="sm" />Another parent</Link>} />
        <div className="stack">
          {family.wallet > 0 && <Note tone="info" icon="wallet">{p.firstName} has {naira(family.wallet)} in their wallet. It&apos;s used first.</Note>}
          <div className="mw-460"><SearchParamInput param="find" id="ct-f" placeholder="Find an item (name or code)" /></div>
          {family.children.length === 0 ? <Card><Empty title="No children linked">Ask the school office to link this parent&apos;s children first.</Empty></Card>
            : <CounterBasket action={placeCounterOrderAction} parentId={p.id} kids={family.children} wallet={family.wallet} />}
        </div>
      </div>
    );
  }

  return (
    <div className="mw-1080">
      <PageHeader title="Counter order" sub="For parents who can't buy online. Place the order with them here, then they pay on Paystack on this computer (card, bank transfer or USSD on their phone). It's packed and collected like any other order, and they get SMS messages." />
      <div className="stack loose">
        <Card className="stack">
          <h3>1. Find the child</h3>
          <div className="mw-460"><SearchParamInput param="q" id="ct-q" placeholder="Pupil's name or registration number" /></div>
          {sp.q && (found.length === 0 ? <p className="small muted">No pupil matches “{sp.q}”.</p> : (
            <ul className="hit-list">
              {found.map((pu) => {
                const g = pu.guardians.find((x) => x.isPrimary) ?? pu.guardians[0];
                return (
                  <li key={pu.id}>{g ? (
                    <Link className="hit" href={`/admin/store/counter?parent=${g.parentId}`}>
                      <span className="grow"><b>{pu.firstName} {pu.lastName}</b><small>{pu.regNumber} · {pu.class.name} · parent {g.parent.firstName} {g.parent.lastName}{g.parent.phone ? ` (${g.parent.phone})` : ""}</small></span>
                      <Icon name="chev" size="sm" />
                    </Link>
                  ) : <div className="hit"><span className="grow"><b>{pu.firstName} {pu.lastName}</b><small>No parent linked: ask the school office</small></span></div>}</li>
                );
              })}
            </ul>
          ))}
        </Card>
        {lists && (
          <>
            <Card pad={false}>
              <CardHeader title={`Waiting for payment (${lists.unpaid.length})`} />
              {lists.unpaid.length === 0 ? <Empty title="None" /> : lists.unpaid.map((o) => (
                <Link key={o.id} className="hit" href={counterOrderPath(o.number)}>
                  <span className="grow"><b className="mono">{orderNo(o.number)}</b> · {o.parent.firstName} {o.parent.lastName}<small>{naira(o.subtotal - o.walletUsed - o.amountReceived)} to pay · placed {fmtDateTime(o.createdAt)} by {o.placedBy}</small></span>
                  <Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill>
                </Link>
              ))}
            </Card>
            <Card pad={false}>
              <CardHeader title="Recent counter orders" />
              {lists.recent.length === 0 ? <Empty title="None yet" /> : lists.recent.map((o) => (
                <Link key={o.id} className="hit" href={counterOrderPath(o.number)}>
                  <span className="grow"><b className="mono">{orderNo(o.number)}</b> · {o.parent.firstName} {o.parent.lastName}<small>{naira(o.subtotal)} · {fmtDateTime(o.createdAt)} · {o.placedBy}</small></span>
                  <Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill>
                </Link>
              ))}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
