import { fmtDate, orderNo } from "@/shared/lib/format";
import { Avatar, Card, Empty, PageHeader, Pill } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { lineReadyAction, markReadyAction, packingQueue, setLinePackedAction, startPackingAction } from "@/modules/fulfilment";
import { ORDER_STATUS } from "@/modules/orders";
import { PackCheckbox } from "../../_components";

export const metadata = { title: "Orders to pack" };

export default async function PackingPage() {
  await requireStaff("fulfilment.manage");
  const { toPack, awaitingStock } = await packingQueue();
  return (
    <>
      <PageHeader title="Orders to pack" sub="Oldest paid orders first. Items are packed per child." />
      <div className="stack loose">
        {toPack.length === 0 && <Card><Empty title="Nothing to pack">Paid orders appear here.</Empty></Card>}
        {toPack.map((o) => {
          const byKid = new Map<string, typeof o.lines>();
          for (const l of o.lines) byKid.set(l.pupilId, [...(byKid.get(l.pupilId) ?? []), l]);
          const st = ORDER_STATUS[o.status];
          return (
            <Card key={o.id} pad={false}>
              <div className="card-h">
                <div className="row tight"><b className="mono">{orderNo(o.number)}</b><Pill tone={st.tone}>{st.label}</Pill><span className="small muted">{o.parent.firstName} {o.parent.lastName} · {fmtDate(o.createdAt)}</span></div>
                {o.status === "PAYMENT_APPROVED"
                  ? <ActionForm action={startPackingAction}><input type="hidden" name="orderId" value={o.id} /><SubmitButton size="sm" variant="default">Start packing</SubmitButton></ActionForm>
                  : <ActionForm action={markReadyAction}><input type="hidden" name="orderId" value={o.id} /><SubmitButton size="sm" icon="check">Mark ready for pick-up</SubmitButton></ActionForm>}
              </div>
              <div className="grid g3" style={{ padding: "14px 18px" }}>
                {[...byKid.entries()].map(([pid, ls]) => (
                  <div key={pid} className="stack tight">
                    <div className="row tight"><Avatar id={pid} first={ls[0].pupil.firstName} last={ls[0].pupil.lastName} size="sm" /><b className="small">{ls[0].pupil.firstName} {ls[0].pupil.lastName} · {ls[0].pupil.class.name}</b></div>
                    {ls.map((l) => (
                      <PackCheckbox key={l.id} action={setLinePackedAction} lineId={l.id} checked={l.status !== "AWAITING_STOCK"} disabled={o.status !== "PACKING" || !l.reserved}
                        label={`${l.qty} × ${l.itemName}${l.variantLabel !== "Standard" ? ` (${l.variantLabel})` : ""}${l.pileName ? ` · ${l.pileName}` : ""}${!l.reserved ? " — not in stock yet" : l.variant.onHand < l.qty ? " — not enough on hand" : ""}`} />
                    ))}
                  </div>
                ))}
              </div>
              {o.status === "PACKING" && <div className="card-b small muted" style={{ borderTop: "1px solid var(--line-2)" }}>Untick anything you can&apos;t supply yet. It stays reserved and the parent sees &ldquo;Awaiting stock&rdquo;.</div>}
            </Card>
          );
        })}
        {awaitingStock.length > 0 && (
          <Card pad={false}>
            <div className="card-h"><h3>Items awaiting stock</h3><span className="small muted">Mark them ready when the delivery arrives</span></div>
            {awaitingStock.flatMap((o) => o.lines.filter((l) => l.status === "AWAITING_STOCK").map((l) => {
              // A book with no stock held yet needs free stock (not promised to other orders)
              const short = l.reserved ? l.variant.onHand < l.qty : l.variant.onHand - l.variant.reserved < l.qty;
              return (
                <div key={l.id} className="order-row" style={{ cursor: "default" }}>
                  <div className="grow"><b className="mono small">{orderNo(o.number)}</b> · {l.qty} × {l.itemName}{l.variantLabel !== "Standard" ? ` (${l.variantLabel})` : ""}{l.pileName && <span className="muted small"> · {l.pileName}</span>} <span className="muted small">for {l.pupil.firstName}</span></div>
                  <ActionForm action={lineReadyAction}><input type="hidden" name="lineId" value={l.id} /><SubmitButton size="sm" variant="default" disabled={short}>{short ? "Restock first" : "Mark ready"}</SubmitButton></ActionForm>
                </div>
              );
            }))}
          </Card>
        )}
      </div>
    </>
  );
}
