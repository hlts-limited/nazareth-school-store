import Image from "next/image";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { ThemeToggle } from "@/shared/ui/client";
import { IdleWatcher, StaffNav, WorkspaceSwitch } from "@/shared/ui/shell-client";
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
        <aside className="side">
          <span className="brand"><Image src="/logo.png" alt="" width={36} height={36} /><span><b>{SCHOOL.name}</b><small>Store back office</small></span></span>
          <StaffNav sections={sections} counts={counts} variant="side" />
          <div className="side-foot">
            <div className="row nowrap">
              <span className="avatar" style={{ background: "var(--ink)" }}>{initials}</span>
              <div className="grow" style={{ lineHeight: 1.2 }}><b style={{ fontSize: 13 }}>{v.user.firstName} {v.user.lastName}</b><div className="tiny muted">{v.roles.map(roleName).join(", ")}</div></div>
              <form action={logout}><button className="icon-btn" type="submit" aria-label="Sign out"><Icon name="logout" size="sm" /></button></form>
            </div>
          </div>
        </aside>
        <div className="staff-main">
          <div className="staff-top">
            <span className="brand show-md"><Image src="/logo.png" alt="" width={30} height={30} /></span>
            <WorkspaceSwitch sections={sections} />
            <div className="grow" />
            <IdleWatcher idleSeconds={idle.idleSeconds} keepAlive={keepAlive} logout={logout} showTimer />
            <ThemeToggle />
            <form action={logout} className="show-md"><button className="icon-btn" type="submit" aria-label="Sign out"><Icon name="logout" size="sm" /></button></form>
          </div>
          <StaffNav sections={sections} counts={counts} variant="tabs" />
          <div className="staff-body">{children}</div>
        </div>
      </div>
    </>
  );
}
