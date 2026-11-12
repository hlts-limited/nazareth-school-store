import { fmtDateTime } from "@/shared/lib/format";
import { Card, Empty, Pill } from "./primitives";

const CHANNEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email", inapp: "In app" };

/** A person's messages, newest first, with how each was sent. Shared by parents and staff. */
export function NotificationList({ items }: { items: { id: string; title: string; body: string; channels: string; readAt: Date | null; createdAt: Date }[] }) {
  return (
    <Card pad={false}>
      {items.length === 0 ? <Empty title="No messages yet" /> : items.map((n) => (
        <div key={n.id} className="note-row">
          <div className="row between small"><b>{n.title}</b><span className="muted tnum">{fmtDateTime(n.createdAt)}</span></div>
          <span>{n.body}</span>
          <span className="row tight">
            {n.channels.split(",").filter(Boolean).map((c) => <Pill key={c} tone="plain" dot={false}>{CHANNEL[c] ?? c}</Pill>)}
            {!n.readAt && <Pill tone="info">New</Pill>}
          </span>
        </div>
      ))}
    </Card>
  );
}
