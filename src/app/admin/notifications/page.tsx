import { requireStaff } from "@/modules/auth";
import { listNotifications, markAllRead } from "@/modules/notifications";
import { NotificationList } from "@/shared/ui/notification-list";
import { PageHeader } from "@/shared/ui/primitives";

export const metadata = { title: "Notifications" };

/** Messages the system has sent this member of staff: leave and document decisions, bank checks, blocked clock-ins and more. */
export default async function StaffNotifications() {
  const v = await requireStaff();
  const list = await listNotifications(v.user.id, 100);
  await markAllRead(v.user.id);
  return (
    <>
      <PageHeader title="Notifications" sub="Everything the system has told you, newest first. Opening this page marks them as read." />
      <NotificationList items={list} />
    </>
  );
}
