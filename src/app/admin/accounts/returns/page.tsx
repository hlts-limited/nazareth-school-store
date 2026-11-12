import { fmtDateTime, naira, orderNo } from "@/shared/lib/format";
import { Card, CardHeader, Empty, PageHeader, Pill } from "@/shared/ui/primitives";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { decideReturnAction, returnQueues } from "@/modules/returns";

export const metadata = { title: "Returns to approve" };

/** Accounts: approve a return to credit the parent's wallet (and restock it), or decline it with a reason. */
export default async function ReturnsToApprove() {
  const v = await requireStaff("payments.review");
  const { pending, recent } = await returnQueues();
  return (
    <>
      <PageHeader title="Returns to approve" sub="Approving credits the parent's wallet with what they paid for the item, and puts it back in stock unless it's damaged. Nobody approves a return they recorded." />
      <div className="stack loose">
        <Card pad={false}>
          <CardHeader title={`Waiting (${pending.length})`} />
          {pending.length === 0 ? <Empty title="All caught up">The Registrar records returns at the store; they appear here.</Empty> : pending.map((r) => (
            <div key={r.id} className="return-line">
              <div className="grow">
                <b>{r.qty} × {r.line.itemName}</b>{r.line.variantLabel !== "Standard" && <span className="muted"> ({r.line.variantLabel})</span>} · <b className="tnum">{naira(r.amount)}</b>
                <div className="small muted">{orderNo(r.order.number)} · {r.order.parent.firstName} {r.order.parent.lastName} (for {r.line.pupil.firstName}) · {r.resellable ? "can be sold again" : "damaged"}</div>
                <div className="small">Reason: {r.reason} <span className="muted">· recorded by {r.recordedBy}, {fmtDateTime(r.createdAt)}</span></div>
              </div>
              {r.recordedById === v.user.id ? <Pill tone="info">You recorded this</Pill> : (
                <ActionForm action={decideReturnAction} className="return-form">
                  <input type="hidden" name="id" value={r.id} />
                  <input className="input" name="note" placeholder="Note (needed to decline)" aria-label="Note" />
                  <SubmitButton size="sm" name="decision" value="approve" icon="check" confirmText={`Credit ${naira(r.amount)} to ${r.order.parent.firstName}'s wallet?`}>Approve</SubmitButton>
                  <SubmitButton size="sm" variant="default" name="decision" value="reject">Decline</SubmitButton>
                  <FieldError name="note" />
                </ActionForm>
              )}
            </div>
          ))}
        </Card>
        <Card pad={false}>
          <CardHeader title="Recently decided" />
          {recent.length === 0 ? <Empty title="No returns decided yet" /> : recent.map((r) => (
            <div key={r.id} className="return-line">
              <div className="grow"><b>{r.qty} × {r.line.itemName}</b> · {naira(r.amount)}<div className="small muted">{orderNo(r.order.number)} · {r.order.parent.firstName} {r.order.parent.lastName} · {r.decidedBy}{r.decisionNote ? ` · ${r.decisionNote}` : ""}</div></div>
              <Pill tone={r.status === "APPROVED" ? "ok" : "err"}>{r.status === "APPROVED" ? "Credited to wallet" : "Declined"}</Pill>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
