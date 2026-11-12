import { fmtDate, fmtDateTime, naira, orderNo } from "@/shared/lib/format";
import { Card, CardHeader, Empty, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { ActionForm, FieldError, SearchParamInput, SubmitButton } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { orderForReturn, recordReturnAction, returnQueues } from "@/modules/returns";

export const metadata = { title: "Returns" };

const STATUS = { PENDING: ["Waiting for Accounts", "warn"], APPROVED: ["Credited to wallet", "ok"], REJECTED: ["Not approved", "err"] } as const;

/** Registrar: record items brought back. Accounts approves before the parent's wallet is credited. */
export default async function ReturnsDesk({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  await requireStaff("fulfilment.manage");
  const { order: no = "" } = await searchParams;
  const [found, queues] = await Promise.all([no ? orderForReturn(no) : null, returnQueues()]);
  return (
    <>
      <PageHeader title="Returns" sub="Record an item a parent brings back. Accounts approves it, then the parent's wallet is credited with what they paid. No cash is given back." />
      <div className="stack loose">
        <Card className="stack">
          <h3>Find the order</h3>
          <div className="mw-460"><SearchParamInput param="order" id="rt-o" placeholder="Order number, e.g. NZ-24815" /></div>
          {no && !found && <Note tone="warn" icon="alert">No order {no.toUpperCase()} was found.</Note>}
          {found && (
            <div className="stack">
              <div className="row between">
                <span><b className="mono">{orderNo(found.order.number)}</b> · {found.order.parent.firstName} {found.order.parent.lastName} · {fmtDate(found.order.createdAt)}</span>
                <span className="small muted">{found.windowDays ? `Returns within ${found.windowDays} days of collection` : "Returns are switched off"}</span>
              </div>
              {found.lines.map((l) => (
                <div key={l.id} className="return-line">
                  <div className="grow">
                    <b>{l.qty} × {l.itemName}</b>{l.variantLabel !== "Standard" && <span className="muted"> ({l.variantLabel})</span>}
                    <div className="small muted">For {l.pupil.firstName} · {naira(l.unitPrice)} each{l.returnedQty ? ` · ${l.returnedQty} already returned` : ""}{l.until && !l.why ? ` · can be returned until ${fmtDate(l.until)}` : ""}</div>
                  </div>
                  {l.why ? <Pill tone="plain">{l.why}</Pill> : (
                    <ActionForm action={recordReturnAction} className="return-form" resetOnSuccess>
                      <input type="hidden" name="lineId" value={l.id} />
                      <label className="small">How many<input className="input tnum w-70" name="qty" type="number" min={1} max={l.left} defaultValue={1} /></label>
                      <label className="small">Condition<select className="input" name="condition" defaultValue="resellable"><option value="resellable">Can be sold again</option><option value="damaged">Damaged</option></select></label>
                      <label className="small grow">Reason<input className="input" name="reason" placeholder="e.g. Wrong size, swapping for size 10" /></label>
                      <SubmitButton size="sm" icon="check">Send to Accounts</SubmitButton>
                      <FieldError name="qty" /><FieldError name="reason" />
                    </ActionForm>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card pad={false}>
          <CardHeader title={`Waiting for Accounts (${queues.pending.length})`} />
          {queues.pending.length === 0 ? <Empty title="Nothing waiting" /> : queues.pending.map((r) => (
            <div key={r.id} className="return-line">
              <div className="grow"><b>{r.qty} × {r.line.itemName}</b> · {naira(r.amount)}<div className="small muted">{orderNo(r.order.number)} · {r.order.parent.firstName} {r.order.parent.lastName} · recorded by {r.recordedBy}, {fmtDateTime(r.createdAt)}</div></div>
              <Pill tone="warn">Waiting for Accounts</Pill>
            </div>
          ))}
        </Card>
        <Card pad={false}>
          <CardHeader title="Recently decided" />
          {queues.recent.length === 0 ? <Empty title="No returns yet" /> : queues.recent.slice(0, 15).map((r) => (
            <div key={r.id} className="return-line">
              <div className="grow"><b>{r.qty} × {r.line.itemName}</b> · {naira(r.amount)}<div className="small muted">{orderNo(r.order.number)} · {r.decidedBy}{r.decisionNote ? ` · ${r.decisionNote}` : ""}</div></div>
              <Pill tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Pill>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
