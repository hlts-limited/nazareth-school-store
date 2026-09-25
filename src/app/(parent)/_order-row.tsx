import Link from "next/link";
import { fmtDate, naira, orderNo } from "@/shared/lib/format";
import { Pill } from "@/shared/ui/primitives";
import { Icon } from "@/shared/ui/icon";
import { ORDER_STATUS, type ordersForParent } from "@/modules/orders";

export function OrderRow({ o }: { o: Awaited<ReturnType<typeof ordersForParent>>[number] }) {
  const names = [...new Set(o.lines.map((l) => l.pupil.firstName))];
  const st = ORDER_STATUS[o.status];
  return (
    <Link href={`/orders/${orderNo(o.number)}`} className="order-row link-row">
      <div className="grow">
        <div className="row tight"><b className="mono">{orderNo(o.number)}</b><Pill tone={st.tone}>{st.label}</Pill></div>
        <div className="small muted">{fmtDate(o.createdAt)} · {o.lines.reduce((a, l) => a + l.qty, 0)} items for {names.join(", ")}</div>
      </div>
      <b className="tnum">{naira(o.subtotal)}</b><Icon name="chev" size="sm" />
    </Link>
  );
}
