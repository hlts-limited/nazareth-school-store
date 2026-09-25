import { fmtDate, naira, orderNo } from "@/shared/lib/format";
import { Avatar, Card, CardHeader, Empty, Note, PageHeader } from "@/shared/ui/primitives";
import { db } from "@/shared/lib/db";
import { requireParentActor } from "@/modules/auth";
import { childrenOf } from "@/modules/pupils";
import { balances, moveExcessAction, statement } from "@/modules/wallet";
import { AutoSubmitSelect } from "../_components";

export const metadata = { title: "Wallet" };

const TYPE_LABEL: Record<string, string> = {
  OVERPAYMENT_CREDIT: "Overpayment credit", CANCELLED_ORDER_CREDIT: "Cancelled order credit", CHECKOUT_DEBIT: "Spent at checkout",
  REFUND: "Refund to parent", ADJUSTMENT: "Adjustment by accounts office", TRANSFER_IN: "Moved from sibling", TRANSFER_OUT: "Moved to sibling",
};

export default async function WalletPage() {
  const { parent, readOnly } = await requireParentActor();
  const kids = await childrenOf(parent.id);
  const [bal, tx] = await Promise.all([balances(kids.map((k) => k.id)), statement(kids.map((k) => k.id))]);
  const orderIds = [...new Set(tx.map((t) => t.orderId).filter(Boolean))] as string[];
  const orders = await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } });
  const onum = (id: string | null) => { const o = orders.find((x) => x.id === id); return o ? orderNo(o.number) : "—"; };
  const movable = tx.filter((t) => t.movable && t.amount > 0);
  return (
    <>
      <PageHeader title="Wallet" sub="Overpayments and refunds are kept in each child's wallet and can be used at checkout." />
      <div className="stack loose">
        <div className="grid g3">
          {kids.map((k) => (
            <div key={k.id} className="card kpi">
              <span className="row tight"><Avatar id={k.id} first={k.firstName} last={k.lastName} size="sm" /><span className="l">{k.firstName} · {k.class.name}</span></span>
              <span className="v">{naira(bal[k.id] ?? 0)}</span>
            </div>
          ))}
        </div>
        {!readOnly && movable.map((t) => (
          <Note key={t.id} tone="warn" icon="info">
            <span className="row">
              <span className="grow"><b>{naira(t.amount)} extra from {onum(t.orderId)}</b> is in {t.wallet.pupil.firstName}&apos;s wallet. Choose which child should keep it:</span>
              <AutoSubmitSelect action={moveExcessAction} name="toPupilId" label="Child to keep it" defaultValue={t.wallet.pupilId} hidden={{ txId: t.id }} options={kids.map((k) => [k.id, k.firstName])} />
            </span>
          </Note>
        ))}
        <Card pad={false}>
          <CardHeader title="Statement" />
          {tx.length === 0 ? <Empty title="No wallet activity yet" /> : (
            <div className="tbl-wrap">
              <table className="t rt">
                <thead><tr><th>Date</th><th>Child</th><th>Description</th><th>Order</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  {tx.map((t) => (
                    <tr key={t.id}>
                      <td data-label="Date">{fmtDate(t.createdAt)}</td>
                      <td data-label="Child">{t.wallet.pupil.firstName}</td>
                      <td data-label="Description">{TYPE_LABEL[t.type] ?? t.type}{t.reason && t.type === "ADJUSTMENT" ? `: ${t.reason}` : ""}</td>
                      <td data-label="Order" className="mono">{onum(t.orderId)}</td>
                      <td data-label="Amount" className="r tnum" style={{ color: t.amount > 0 ? "var(--ok)" : "var(--ink)", fontWeight: 600 }}>{t.amount > 0 ? "+" : ""}{naira(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
