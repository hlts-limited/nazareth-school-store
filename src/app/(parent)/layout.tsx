import Image from "next/image";
import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { ThemeToggle } from "@/shared/ui/client";
import { IdleWatcher, ParentNav } from "@/shared/ui/shell-client";
import { displayName, endViewAs, getViewer, idleInfo, keepAlive, logout, requireParentActor } from "@/modules/auth";
import { cartCount } from "@/modules/cart";
import { unreadCount } from "@/modules/notifications";
import { childrenOf } from "@/modules/pupils";
import { ViewAsBanner } from "@/app/view-as-banner";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const { parent, viewAs } = await requireParentActor();
  const [count, unread, kids, idle, viewer] = await Promise.all([cartCount(parent.id), unreadCount(parent.id), childrenOf(parent.id), idleInfo("PARENT"), getViewer()]);
  const remembered = viewer?.kind === "parent" && viewer.session.remember;
  return (
    <>
      {viewAs && <ViewAsBanner name={viewAs.name} expiresAt={viewAs.expiresAt} endAction={endViewAs} />}
      <div className="shell">
        <header className="topbar">
          <div className="topbar-in">
            <Link className="brand" href="/home">
              <Image src="/logo.png" alt="" width={36} height={36} />
              <span><b>{SCHOOL.storeName}</b><small className="hide-sm">{SCHOOL.motto}</small></span>
            </Link>
            <ParentNav cartCount={count} variant="top" />
            <div className="grow" />
            <ThemeToggle />
            <Link className="icon-btn" href="/notifications" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}>
              <Icon name="bell" />{unread > 0 && <span className="badge">{unread}</span>}
            </Link>
            <Link className="user-chip" href="/account" aria-label="Account">
              <span className="avatar" style={{ background: "var(--ink)" }}>{parent.firstName[0]}{parent.lastName[0]}</span>
              <span className="who"><b>{displayName(parent)}</b><span>Parent · {kids.length} {kids.length === 1 ? "child" : "children"}</span></span>
            </Link>
          </div>
        </header>
        <main className="main">{children}</main>
        <ParentNav cartCount={count} variant="bottom" />
      </div>
      {!viewAs && !remembered && <IdleWatcher idleSeconds={idle.idleSeconds} keepAlive={keepAlive} logout={logout} />}
    </>
  );
}
