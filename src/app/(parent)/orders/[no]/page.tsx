import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { fmtDate, fmtDateTime, isoDay, naira, orderNo } from "@/shared/lib/format";
import { Avatar, Card, CardHeader, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { ActionForm, CopyButton, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { SCHOOL } from "@/shared/config/school";
import { requireParentActor } from "@/modules/auth";
import { amountDue, cancelOrderAction, getOrderByNo, isPaid, LINE_STATUS, ORDER_STATUS, stepIndex, UNPAID_STATUSES } from "@/modules/orders";
import { payFromWalletAction, startPaystackAction, uploadReceiptAction } from "@/modules/payments";
import { getSettings } from "@/modules/settings";
import { balances } from "@/modules/wallet";
import { childrenOf } from "@/modules/pupils";
import { UploadReceipt } from "../../_components";

export async function generateMetadata({ params }: { params: Promise<{ no: string }> }) {
  return { title: `Order ${(await params).no}` };
}

export default async function OrderPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const { parent, readOnly } = await requireParentActor();
  const o = await getOrderByNo(no, parent.id);
  if (!o) notFound();
  const [settings, kids] = await Promise.all([getSettings(), childrenOf(parent.id)]);
  const bal = await balances(kids.map((k) => k.id));
  const walletTotal = Object.values(bal).reduce((a, b) => a + b, 0);
  const due = amountDue(o);
  const st = ORDER_STATUS[o.status];
  const cur = stepIndex(o.status);
  const steps: [string, string][] = [
    ["Placed", fmtDate(o.createdAt)],
    ["Payment approved", cur === 1 ? st.label : ""],
    ["Being packed", ""],
    ["Ready for pick-up", o.pickupCode && cur >= 3 ? `Code ${o.pickupCode}` : ""],
    ["Collected", ""],
  ];
  const byKid = new Map<string, typeof o.lines>();
  for (const l of o.lines) byKid.set(l.pupilId, [...(byKid.get(l.pupilId) ?? []), l]);
  const qr = o.pickupCode && (o.status === "READY" || o.status === "PARTIALLY_HANDED_OUT") ? await QRCode.toDataURL(`NAZ-PICKUP:${o.pickupCode}`, { margin: 1, width: 192 }) : null;
  const unpaid = UNPAID_STATUSES.includes(o.status);

  const transferBox = (
    <div className="bank-box">
      <div className="eyebrow">Transfer exactly {naira(due)} to</div>
      <div className="kv"><span className="muted">Account name</span><b>{settings.bank.accountName}</b></div>
      <div className="kv"><span className="muted">Bank</span><b>{settings.bank.bankName}</b></div>
      <div className="kv"><span className="muted">Account number</span><span className="row tight"><b className="mono">{settings.bank.accountNumber}</b><CopyButton text={settings.bank.accountNumber} /></span></div>
      <div className="kv"><span className="muted">Narration / reference</span><span className="row tight"><b className="mono">{orderNo(o.number)}</b><CopyButton text={orderNo(o.number)} /></span></div>
    </div>
  );

  return (
    <>
      <Link href="/orders" className="btn ghost sm" style={{ marginBottom: 10 }}><Icon name="back" size="sm" /> Orders</Link>
      <PageHeader
        title={<span className="row tight"><span className="mono" style={{ fontFamily: "var(--mono)" }}>{orderNo(o.number)}</span><Pill tone={st.tone}>{st.label}</Pill></span>}
        sub={`Placed ${fmtDate(o.createdAt)} · ${o.method === "PAYSTACK" ? "Paystack" : o.method === "WALLET" ? "Wallet" : "Bank transfer"}`}
        actions={<a className="btn sm" href={`/api/orders/${orderNo(o.number)}/invoice`}><Icon name="download" size="sm" /> {isPaid(o.status) ? "Receipt" : "Invoice"} (PDF)</a>}
      />
      <div className="stack loose">
        <Card className="stack">
          {o.status !== "CANCELLED" ? (
            <div className="stepper">
              {steps.map(([label, sub], i) => {
                const done = i < cur || cur === 5;
                const isCur = i === cur && !done;
                return (
                  <div key={label} className={`step ${done ? "done" : ""} ${isCur ? "cur" : ""} ${isCur && i === 1 ? "warnish" : ""}`}>
                    <span className="dot">{done ? <Icon name="check" size="sm" /> : i + 1}</span>
                    <span className="txt">{label}{sub && <small>{sub}</small>}</span>
                  </div>
                );
              })}
            </div>
          ) : <Note tone="err" icon="x">This order was cancelled. Any money already paid is in your child&apos;s wallet.</Note>}

          {o.status === "PENDING_PAYMENT" && o.method === "TRANSFER" && (<>{transferBox}<div className="row"><UploadReceipt action={uploadReceiptAction} orderId={o.id} due={due} readOnly={readOnly} today={isoDay()} /></div></>)}
          {o.status === "PENDING_PAYMENT" && o.method === "PAYSTACK" && (
            <ActionForm action={startPaystackAction} className="row"><input type="hidden" name="orderId" value={o.id} /><SubmitButton size="lg" disabled={readOnly}>Pay {naira(due)} with Paystack</SubmitButton></ActionForm>
          )}
          {o.status === "PAYMENT_REJECTED" && (<><Note tone="err" icon="alert"><b>Receipt not accepted:</b> {o.rejectReason}</Note>{transferBox}<div className="row"><UploadReceipt action={uploadReceiptAction} orderId={o.id} due={due} readOnly={readOnly} today={isoDay()} label="Upload a new receipt" /></div></>)}
          {o.status === "PART_PAID" && (
            <>
              <Note tone="err" icon="alert"><b>Balance due: {naira(due)}.</b> We received {naira(o.amountReceived)} of {naira(o.subtotal - o.walletUsed)}. Your items stay reserved while you pay the balance; if it isn&apos;t paid within {settings.autoCancelHours} hours, the order is cancelled and the money received goes to your child&apos;s wallet.</Note>
              <div className="row">
                <ActionForm action={startPaystackAction} className="inline-form"><input type="hidden" name="orderId" value={o.id} /><SubmitButton icon="card" disabled={readOnly}>Pay {naira(due)} with Paystack</SubmitButton></ActionForm>
                <UploadReceipt action={uploadReceiptAction} orderId={o.id} due={due} readOnly={readOnly} today={isoDay()} label="Upload transfer receipt" />
              </div>
            </>
          )}
          {unpaid && walletTotal >= due && due > 0 && (
            <ActionForm action={payFromWalletAction} className="row"><input type="hidden" name="orderId" value={o.id} /><SubmitButton variant="default" icon="wallet" disabled={readOnly}>Pay {naira(due)} from wallets ({naira(walletTotal)} available)</SubmitButton></ActionForm>
          )}
          {o.status === "AWAITING_VERIFICATION" && <Note icon="clock"><b>Your receipt is with the accounts office.</b> You&apos;ll get an SMS as soon as it&apos;s confirmed, usually within one working day.</Note>}
          {qr && (
            <div className="pickup-code">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Pick-up QR code" className="qr" />
              <div className="stack tight"><span className="eyebrow">Pick-up code</span><span className="code">{o.pickupCode}</span><span className="small">Show this at {SCHOOL.pickupPlace}. Anyone you send can collect with this code.</span></div>
            </div>
          )}
        </Card>

        <div className="grid g2" style={{ alignItems: "start" }}>
          <Card pad={false}>
            <CardHeader title="Items by child" />
            {[...byKid.entries()].map(([pid, ls]) => (
              <div key={pid} className="card-b stack tight" style={{ borderTop: "1px solid var(--line-2)" }}>
                <div className="row"><Avatar id={pid} first={ls[0].pupil.firstName} last={ls[0].pupil.lastName} size="sm" /><b>{ls[0].pupil.firstName} {ls[0].pupil.lastName}</b><span className="small muted">{ls[0].pupil.class.name}</span></div>
                {ls.map((l) => (
                  <div key={l.id} className="row between small">
                    <span className="grow">{l.qty} × {l.itemName}{l.variantLabel !== "Standard" && <span className="muted"> ({l.variantLabel})</span>}</span>
                    <Pill tone={LINE_STATUS[l.status].tone}>{LINE_STATUS[l.status].label}</Pill>
                  </div>
                ))}
              </div>
            ))}
          </Card>
          <Card className="stack">
            <h3>Payment</h3>
            <div className="sum-row"><span className="muted">Order total</span><span>{naira(o.subtotal)}</span></div>
            {o.walletUsed > 0 && <div className="sum-row"><span className="muted">Paid from wallet</span><span>{naira(o.walletUsed)}</span></div>}
            {o.amountReceived > 0 && <div className="sum-row"><span className="muted">Received</span><span>{naira(o.amountReceived)}</span></div>}
            {o.excess > 0 && <div className="sum-row"><span className="muted">Extra, credited to wallet</span><span style={{ color: "var(--ok)" }}>{naira(o.excess)}</span></div>}
            <div className="sum-row total"><span>{unpaid || o.status === "AWAITING_VERIFICATION" ? "Due" : "Paid"}</span><span>{naira(unpaid || o.status === "AWAITING_VERIFICATION" ? due : o.subtotal)}</span></div>
            <div className="divider" />
            <h3>History</h3>
            <div className="stack tight">
              {[...o.events].reverse().map((e) => (
                <div key={e.id} className="row nowrap small" style={{ alignItems: "flex-start" }}>
                  <span className="muted tnum" style={{ width: 130, flex: "none" }}>{fmtDateTime(e.createdAt)}</span><span>{e.message}</span>
                </div>
              ))}
            </div>
            {unpaid && !readOnly && (
              <ActionForm action={cancelOrderAction} className="row"><input type="hidden" name="orderId" value={o.id} /><SubmitButton variant="danger" size="sm" confirmText="Cancel this order? Reserved items go back on sale.">Cancel order</SubmitButton></ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
