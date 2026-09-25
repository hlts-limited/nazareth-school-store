import Link from "next/link";
import { fmtDate, fmtDateTime, maskPhone, naira, orderNo } from "@/shared/lib/format";
import { Card, Empty, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { ORDER_STATUS } from "@/modules/orders";
import { approvePaymentAction, rejectPaymentAction, reviewQueue } from "@/modules/payments";
import { ApproveForm, ReceiptViewer } from "../../_components";

export const metadata = { title: "Payments to review" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  await requireStaff("payments.review");
  const sp = await searchParams;
  const queue = await reviewQueue();
  if (!queue.length) return (<><PageHeader title="Payments to review" /><Card><Empty title="All caught up">New transfer receipts appear here as parents upload them.</Empty></Card></>);
  const cur = queue.find((q) => orderNo(q.order.number) === sp.o) ?? queue[0];
  const o = cur.order;
  const pupils = [...new Map(o.lines.map((l) => [l.pupilId, l.pupil] as const)).values()];
  const st = ORDER_STATUS[o.status];
  return (
    <>
      <PageHeader title="Payments to review" sub="Check each receipt against the bank statement before approving." />
      <div className="review">
        <Card pad={false} className="">
          <div className="card-h"><b>{queue.length} waiting</b><span className="small muted">Oldest first</span></div>
          {queue.map((q) => (
            <Link key={q.order.id} href={`/admin/accounts/review?o=${orderNo(q.order.number)}`} className={`queue-item link-row ${q.order.id === o.id ? "on" : ""}`}>
              <div className="row between"><b className="mono">{orderNo(q.order.number)}</b><span className="small muted">{q.receipt ? fmtDate(q.receipt.uploadedAt) : ""}</span></div>
              <div className="row between small"><span>{q.order.parent.firstName} {q.order.parent.lastName}</span><span className="tnum">{naira(q.receipt?.amountClaimed ?? 0)} / {naira(q.due)}</span></div>
              {q.duplicateOf && <span className="pill err" style={{ alignSelf: "flex-start" }}>Possible duplicate</span>}
            </Link>
          ))}
        </Card>
        <div className="stack">
          {cur.duplicateOf && <Note tone="err" icon="alert"><b>Possible duplicate receipt.</b> The same file was uploaded for {cur.duplicateOf.orderNo} on {fmtDate(cur.duplicateOf.uploadedAt)}. Check the bank statement before approving.</Note>}
          <div className="grid g2" style={{ alignItems: "start" }}>
            <section className="stack tight">
              {cur.receipt ? <ReceiptViewer src={`/api/files/${cur.receipt.fileKey}`} mime={cur.receipt.mimeType} /> : <Card><Empty title="No receipt file" /></Card>}
              {cur.receipt && <div className="small muted">{cur.receipt.bankName} · transfer date {fmtDate(cur.receipt.transferDate)} · uploaded {fmtDateTime(cur.receipt.uploadedAt)}</div>}
            </section>
            <Card className="stack">
              <div>
                <div className="eyebrow">Order</div>
                <div className="row tight"><b className="mono" style={{ fontSize: 18 }}>{orderNo(o.number)}</b><Pill tone={st.tone}>{st.label}</Pill></div>
                <div className="small muted">{o.parent.firstName} {o.parent.lastName} · {maskPhone(o.parent.phone)} · for {pupils.map((p) => `${p.firstName} (${p.class.name})`).join(", ")}</div>
              </div>
              {cur.payment && (
                <ApproveForm key={cur.payment.id} approve={approvePaymentAction} reject={rejectPaymentAction} paymentId={cur.payment.id} due={cur.due}
                  claimed={cur.receipt?.amountClaimed ?? 0} firstChild={pupils[0]?.firstName ?? "the child"} multiChild={pupils.length > 1} parentFirst={o.parent.firstName} />
              )}
              <div className="divider" />
              <div className="small"><b>Items</b></div>
              {o.lines.map((l) => (
                <div key={l.id} className="row between small"><span>{l.qty} × {l.itemName} <span className="muted">({l.pupil.firstName})</span></span><span className="tnum">{naira(l.qty * l.unitPrice)}</span></div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
