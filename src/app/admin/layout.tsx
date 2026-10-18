import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { ThemeToggle } from "@/shared/ui/client";
import { IdleWatcher, StaffNav, StaffSide, WorkspaceSwitch } from "@/shared/ui/shell-client";
import { roleName, STAFF_SECTIONS } from "@/modules/access-control";
import { endViewAs, getViewAs, idleInfo, keepAlive, logout, requireStaff } from "@/modules/auth";
import { navCounts } from "@/modules/reports";
import { ViewAsBanner } from "@/app/view-as-banner";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const v = await requireStaff();
  const sections = STAFF_SECTIONS.filter((s) => v.permissions.has(s.perm)).map((s) => ({ id: s.id, label: s.label, items: s.items }));
  const [counts, idle, viewAs] = await Promise.all([navCounts(), idleInfo(v.isAdmin ? "ADMIN" : "STAFF"), getViewAs()]);
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
            <div className="grow" />
            <IdleWatcher idleSeconds={idle.idleSeconds} keepAlive={keepAlive} logout={logout} showTimer />
            <ThemeToggle />
          </div>
          <div className="staff-body">{children}</div>
        </div>
      </div>
    </>
  );
}
