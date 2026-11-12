import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { ThemeToggle } from "@/shared/ui/client";
import { IdleWatcher, StaffNav, StaffSide, WorkspaceSwitch } from "@/shared/ui/shell-client";
import { navFor, roleName } from "@/modules/access-control";
import { endViewAs, getViewAs, idleInfo, keepAlive, logout, requireStaff } from "@/modules/auth";
import { navCounts } from "@/modules/reports";
import { unreadCount } from "@/modules/notifications";
import { ViewAsBanner } from "@/app/view-as-banner";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const v = await requireStaff();
  // The menu shows only the areas and links this person can open
  const sections = navFor(v.permissions).map((s) => ({ id: s.id, label: s.label, items: s.items.map(({ href, label, icon, badge }) => ({ href, label, icon, badge })) }));
  const [counts, idle, viewAs, unread] = await Promise.all([navCounts(v.permissions), idleInfo(v.isAdmin ? "ADMIN" : "STAFF"), getViewAs(), unreadCount(v.user.id)]);
  const initials = `${v.user.firstName[0]}${v.user.lastName[0]}`;
  return (
    <>
      {viewAs && <ViewAsBanner name={viewAs.name} expiresAt={viewAs.expiresAt} endAction={endViewAs} />}
      <div className="staff">
        <StaffSide name={SCHOOL.name}>
          <StaffNav sections={sections} counts={counts} />
          <div className="side-foot">
            <Link className="nav" href="/" target="_blank" rel="noopener" title="View the school website"><Icon name="eye" size="sm" /><span className="side-l">School website</span></Link>
            <Link className="nav side-me" href="/admin/account" title="My account and password">
              <span className="avatar">{initials}</span>
              <span className="side-l"><b>{v.user.firstName} {v.user.lastName}</b><small>{v.roles.map(roleName).join(", ")}</small></span>
            </Link>
            <form action={logout}><button className="nav" type="submit" title="Sign out"><Icon name="logout" size="sm" /><span className="side-l">Sign out</span></button></form>
          </div>
        </StaffSide>
        <div className="staff-main">
          <div className="staff-top">
            <WorkspaceSwitch sections={sections} />
            <form className="top-search" action="/admin/search" method="get" role="search">
              <Icon name="search" size="sm" />
              <input name="q" type="search" placeholder="Search pupils, parents, orders, staff" aria-label="Search the back office" />
            </form>
            <div className="grow" />
            <Link className="icon-btn top-bell" href="/admin/notifications" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`} title="Notifications">
              <Icon name="bell" size="sm" />{unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
            </Link>
            <IdleWatcher idleSeconds={idle.idleSeconds} keepAlive={keepAlive} logout={logout} showTimer />
            <ThemeToggle />
          </div>
          <div className="staff-body">{children}</div>
        </div>
      </div>
    </>
  );
}
