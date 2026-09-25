import { notFound, redirect } from "next/navigation";
import { naira, orderNo } from "@/shared/lib/format";
import { Card, Note, PageHeader } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { requireParentActor } from "@/modules/auth";
import { amountDue, getOrderByNo, UNPAID_STATUSES } from "@/modules/orders";
import { paystackMock, startPaystackAction } from "@/modules/payments";

export const metadata = { title: "Pay with Paystack" };

/** Hand-off page before Paystack's secure checkout */
export default async function PayPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const { parent, readOnly } = await requireParentActor();
  const o = await getOrderByNo(no, parent.id);
  if (!o) notFound();
  if (!UNPAID_STATUSES.includes(o.status)) redirect(`/orders/${orderNo(o.number)}`);
  return (
    <div style={{ maxWidth: 520 }}>
      <PageHeader title="Pay with Paystack" sub={`Order ${orderNo(o.number)}`} />
      <Card className="stack">
        <div className="sum-row total" style={{ border: 0, paddingTop: 0 }}><span>Amount</span><span>{naira(amountDue(o))}</span></div>
        <p className="muted">You&apos;ll go to Paystack&apos;s secure page to pay by card, bank app, USSD or transfer. Card details never reach the school&apos;s servers.</p>
        {paystackMock() && <Note tone="warn" icon="info"><b>Development mode:</b> no Paystack key is set, so this payment is simulated and approved automatically.</Note>}
        <ActionForm action={startPaystackAction} className="stack">
          <input type="hidden" name="orderId" value={o.id} />
          <SubmitButton size="lg" block disabled={readOnly}>Continue to Paystack</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
