import { Card, Empty, LinkButton, PageHeader } from "@/shared/ui/primitives";
import { requireParentActor } from "@/modules/auth";
import { ordersForParent } from "@/modules/orders";
import { OrderRow } from "../_order-row";

export const metadata = { title: "Orders" };

export default async function OrdersPage() {
  const { parent } = await requireParentActor();
  const orders = await ordersForParent(parent.id, 100);
  return (
    <>
      <PageHeader title="Orders" sub="Track each order from payment to pick-up." />
      <Card pad={false}>
        {orders.length ? orders.map((o) => <OrderRow key={o.id} o={o} />) : <Empty title="No orders yet" action={<LinkButton href="/shop" variant="primary">Start shopping</LinkButton>} />}
      </Card>
    </>
  );
}
