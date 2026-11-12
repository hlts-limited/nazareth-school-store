import { fmtDate, naira, orderNo } from "@/shared/lib/format";
import { Card, CardHeader, Empty, PageHeader } from "@/shared/ui/primitives";
import { requireParentActor } from "@/modules/auth";
import { balance, statement } from "@/modules/wallet";
import { orderNumbers } from "@/modules/orders";

export const metadata = { title: "Wallet" };

const TYPE_LABEL: Record<string, string> = {
  RETURN_CREDIT: "Item returned", OVERPAYMENT_CREDIT: "Overpayment", CANCELLED_ORDER_CREDIT: "Cancelled order", CHECKOUT_DEBIT: "Used for an order",
  REFUND: "Paid back to you by the school", ADJUSTMENT: "Correction by the accounts office", TRANSFER_IN: "Moved between children", TRANSFER_OUT: "Moved between children",
};

/** The parent's one wallet: store credit from returns and cancelled orders, used first on every order. */
export default async function WalletPage() {
  const { parent } = await requireParentActor();
  const [held, tx] = await Promise.all([balance(parent.id), statement(parent.id)]);
  const numbers = await orderNumbers([...new Set(tx.map((t) => t.orderId).filter(Boolean))] as string[]);
  const onum = (id: string | null) => { const n = id ? numbers.get(id) : undefined; return n !== undefined ? orderNo(n) : "—"; };
  return (
    <>
      <PageHeader title="Wallet" sub="Credit from returned items and cancelled orders. It's used first on your next order, for any of your children." />
      <div className="stack loose">
        <div className="card kpi wallet-kpi">
          <span className="l">In your wallet</span>
          <span className="v">{naira(held)}</span>
          <span className="small muted">{held > 0 ? "Taken off automatically when you next pay." : "Nothing to use yet."}</span>
        </div>
        <Card pad={false}>
          <CardHeader title="Statement" />
          {tx.length === 0 ? <Empty title="No wallet activity yet" /> : (
            <div className="tbl-wrap">
              <table className="t rt">
                <thead><tr><th>Date</th><th>What</th><th>Order</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  {tx.map((t) => (
                    <tr key={t.id}>
                      <td data-label="Date">{fmtDate(t.createdAt)}</td>
                      <td data-label="What">{TYPE_LABEL[t.type] ?? t.type}{t.reason && ["ADJUSTMENT", "RETURN_CREDIT", "REFUND"].includes(t.type) ? <span className="small muted"> · {t.reason}</span> : null}</td>
                      <td data-label="Order" className="mono">{onum(t.orderId)}</td>
                      <td data-label="Amount" className={`r tnum fw-600 ${t.amount > 0 ? "c-ok" : ""}`}>{t.amount > 0 ? "+" : ""}{naira(t.amount)}</td>
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
