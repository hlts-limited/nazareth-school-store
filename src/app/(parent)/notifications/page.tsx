import { PageHeader } from "@/shared/ui/primitives";
import { NotificationList } from "@/shared/ui/notification-list";
import { requireParentActor } from "@/modules/auth";
import { listNotifications, markAllRead } from "@/modules/notifications";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { parent, readOnly } = await requireParentActor();
  const list = await listNotifications(parent.id, 50);
  if (!readOnly) await markAllRead(parent.id);
  return (
    <>
      <PageHeader title="Notifications" sub="Messages we've sent you by WhatsApp and email." />
      <NotificationList items={list} />
    </>
  );
}
