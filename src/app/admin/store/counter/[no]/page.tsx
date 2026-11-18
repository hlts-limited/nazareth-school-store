import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDateTime, naira, orderNo } from "@/shared/lib/format";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Card, CardHeader, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { counterOrder, payCounterOrderAction } from "@/modules/counter";
import { amountDue, ORDER_STATUS, UNPAID_STATUSES } from "@/modules/orders";
import { paystackReady } from "@/modules/payments";

export const metadata = { title: "Counter order" };

/** A counter order at the desk: take the payment on Paystack, print the slip, and see where it's up to. */
export default async function CounterOrderPage({ params }: { params: Promise<{ no: string }> }) {
  await requireStaff("store.counter");
  const o = await counterOrder((await params).no);
  if (!o) notFound();
  const no = orderNo(o.number);
  const due = amountDue(o);
  const unpaid = UNPAID_STATUSES.includes(o.status);
  const st = ORDER_STATUS[o.status];
  const byChild = new Map<string, typeof o.lines>();
  for (const l of o.lines) byChild.set(l.pupilId, [...(byChild.get(l.pupilId) ?? []), l]);
  const failed = o.payments.find((p) => p.method === "PAYSTACK" && p.status === "REJECTED");

  return (
    <div className="mw-900">
      <PageHeader title={<span className="row tight"><span className="mono">{no}</span><Pill tone={st.tone}>{st.label}</Pill></span>}
        sub={<>{o.parent.firstName} {o.parent.lastName} · {o.parent.phone ?? "no phone"} · placed {fmtDateTime(o.createdAt)} by {o.placedBy}</>}
        actions={<div className="row tight">
          <a className="btn" href={`/api/orders/${no}/invoice?print=1`} target="_blank" rel="noopener noreferrer"><Icon name="print" size="sm" />Print slip</a>
          <Link className="btn" href="/admin/store/counter"><Icon name="back" size="sm" />Counter</Link>
        </div>} />
      <div className="stack">
        {unpaid ? (
          <Card className="stack">
            <h3>Take the payment</h3>
            <div className="sum-row"><span className="muted">Order total</span><span className="tnum">{naira(o.subtotal)}</span></div>
            {o.walletUsed > 0 && <div className="sum-row"><span className="muted">From the parent&apos;s wallet</span><span className="tnum c-ok">−{naira(o.walletUsed)}</span></div>}
            {o.amountReceived > 0 && <div className="sum-row"><span className="muted">Already received</span><span className="tnum c-ok">−{naira(o.amountReceived)}</span></div>}
            <div className="sum-row total"><span>To pay now</span><span className="tnum">{naira(due)}</span></div>
            {failed && <Note tone="warn" icon="alert">The last Paystack attempt didn&apos;t go through. Try again.</Note>}
            {paystackReady() ? (
              <ActionForm action={payCounterOrderAction} className="row">
                <input type="hidden" name="no" value={no} />
                <SubmitButton size="lg" icon="card">Pay {naira(due)} now on Paystack</SubmitButton>
              </ActionForm>
            ) : <Note tone="err" icon="alert">Paystack isn&apos;t switched on yet, so payments can&apos;t be taken.</Note>}
            <p className="small muted">Paystack opens on this computer. The parent can pay by <b>card</b>, or choose <b>Transfer</b> or <b>USSD</b> and pay from their own phone (no internet needed). When it goes through you come back here and the order goes to packing. If they can&apos;t pay today, the items are held for 72 hours and they get an SMS reminder; open this order from the Counter page when they come back.</p>
          </Card>
        ) : o.status === "CANCELLED" ? (
          <Note tone="err" icon="x">This order was cancelled. Anything already paid is in the parent&apos;s wallet.</Note>
        ) : (
          <Note tone="ok" icon="check">
            Paid. {o.status === "READY" || o.status === "PARTIALLY_HANDED_OUT"
              ? <>Ready for pick-up: code <b className="mono">{o.pickupCode}</b> (the parent also gets it by SMS).</>
              : o.status === "HANDED_OUT" ? "Collected." : "It's with the packers; the parent gets an SMS with the pick-up code when it's ready."}
          </Note>
        )}
        <Card pad={false}>
          <CardHeader title="Items" />
          {[...byChild.values()].map((ls) => (
            <div key={ls[0].pupilId} className="card-b stack tight bt-line">
              <b>{ls[0].pupil.firstName} {ls[0].pupil.lastName}</b>
              {[...new Map(ls.map((l) => [l.pileItemId ?? l.id, l])).values()].map((l) => (
                <div key={l.id} className="row between small">
                  <span>{l.pileItemId ? <>1 × {l.pileName} <Pill tone="violet" dot={false}>Pile</Pill></> : <>{l.qty} × {l.itemName}{l.variantLabel !== "Standard" && <span className="muted"> ({l.variantLabel})</span>}</>}</span>
                  <span className="tnum">{naira(l.pileItemId ? ls.filter((x) => x.pileItemId === l.pileItemId).reduce((a, x) => a + x.unitPrice * x.qty, 0) : l.unitPrice * l.qty)}</span>
                </div>
              ))}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
