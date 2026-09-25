import { fmtDateTime } from "@/shared/lib/format";
import { Card, Empty, PageHeader, Pill } from "@/shared/ui/primitives";
import { requireParentActor } from "@/modules/auth";
import { listNotifications, markAllRead } from "@/modules/notifications";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { parent, readOnly } = await requireParentActor();
  const list = await listNotifications(parent.id, 50);
  if (!readOnly) await markAllRead(parent.id);
  return (
    <>
      <PageHeader title="Notifications" sub="Messages we've sent you by SMS, WhatsApp and email." />
      <Card pad={false}>
        {list.length === 0 ? <Empty title="No messages yet" /> : list.map((n) => (
          <div key={n.id} className="order-row" style={{ cursor: "default" }}>
            <div className="grow stack tight">
              <div className="row between small"><b>{n.title}</b><span className="muted tnum">{fmtDateTime(n.createdAt)}</span></div>
              <span>{n.body}</span>
              <span className="row tight">{n.channels.split(",").map((c) => <Pill key={c} tone="plain" dot={false}>{c === "sms" ? "SMS" : c === "whatsapp" ? "WhatsApp" : c === "email" ? "Email" : "In app"}</Pill>)}{!n.readAt && <Pill tone="info">New</Pill>}</span>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
