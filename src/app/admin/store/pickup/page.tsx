import Link from "next/link";
import { orderNo } from "@/shared/lib/format";
import { Card, Empty, PageHeader, Pill } from "@/shared/ui/primitives";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { db } from "@/shared/lib/db";
import { requireStaff } from "@/modules/auth";
import { findByPickupCode, handOutAction } from "@/modules/fulfilment";
import { LINE_STATUS, ORDER_STATUS } from "@/modules/orders";
import { PickupCodeInput } from "../../_components";

export const metadata = { title: "Pick-up desk" };

export default async function PickupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireStaff("fulfilment.manage");
  const { code = "" } = await searchParams;
  const o = code ? await findByPickupCode(code) : null;
  const waiting = await db.order.findMany({ where: { status: { in: ["READY", "PARTIALLY_HANDED_OUT"] } }, include: { parent: true }, orderBy: { updatedAt: "asc" }, take: 30 });
  return (
    <>
      <PageHeader title="Pick-up desk" sub="Type the 4-digit code from the parent's phone (or scan the QR code with a barcode scanner)." />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <Card className="stack">
          <div className="field"><label htmlFor="pk">Pick-up code</label><PickupCodeInput initial={code} /></div>
          {code && !o && <div className="field-error">No order is waiting with code {code}.</div>}
          <div className="small muted">Waiting for pick-up ({waiting.length}):</div>
          <div className="stack tight">
            {waiting.map((w) => (
              <Link key={w.id} className="row between small link-row" href={`/admin/store/pickup?code=${w.pickupCode}`}>
                <span><b className="mono">{orderNo(w.number)}</b> · {w.parent.firstName} {w.parent.lastName}</span><span className="mono">{w.pickupCode}</span>
              </Link>
            ))}
          </div>
        </Card>
        {o ? (
          <ActionForm action={handOutAction} className="card stack">
            <input type="hidden" name="orderId" value={o.id} />
            <div className="row between"><div className="row tight"><b className="mono">{orderNo(o.number)}</b><Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill></div><span className="small muted">{o.parent.firstName} {o.parent.lastName}</span></div>
            {o.lines.map((l) => (
              <label key={l.id} className="check small" style={{ opacity: l.status === "HANDED_OUT" ? 0.5 : 1 }}>
                <input type="checkbox" name="lineIds" value={l.id} defaultChecked={l.status === "READY"} disabled={l.status !== "READY"} />
                {l.qty} × {l.itemName}{l.variantLabel !== "Standard" ? ` (${l.variantLabel})` : ""} <span className="muted">for {l.pupil.firstName}</span>
                {l.status !== "READY" && <Pill tone={LINE_STATUS[l.status].tone}>{LINE_STATUS[l.status].label}</Pill>}
              </label>
            ))}
            <div className="grid g2">
              <div className="field"><label htmlFor="cb-name">Collected by</label><input className="input" id="cb-name" name="collectedBy" defaultValue={`${o.parent.firstName} ${o.parent.lastName}`} /><FieldError name="collectedBy" /></div>
              <div className="field"><label htmlFor="cb-rel">Relationship</label><select className="input" id="cb-rel" name="relationship"><option>Parent</option><option>Driver</option><option>Relative</option><option>Pupil (with permission)</option></select></div>
            </div>
            <SubmitButton variant="success" size="lg" icon="check">Confirm hand-out</SubmitButton>
          </ActionForm>
        ) : <Card><Empty title="No order selected">Enter a code to see what to hand out.</Empty></Card>}
      </div>
    </>
  );
}
