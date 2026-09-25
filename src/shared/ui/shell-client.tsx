"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import { Dialog } from "./client";

/** Parent top navigation + phone bottom bar, with the active tab highlighted */
export function ParentNav({ cartCount, variant }: { cartCount: number; variant: "top" | "bottom" }) {
  const path = usePathname();
  const tabs: [string, string, string][] = [["/home", "Home", "home"], ["/shop", "Shop", "shop"], ["/cart", "Cart", "cart"], ["/orders", "Orders", "box"], ["/wallet", "Wallet", "wallet"]];
  const active = (href: string) => path === href || path.startsWith(href + "/");
  return (
    <nav className={variant === "top" ? "topnav" : "bottomnav"} aria-label="Main">
      {tabs.map(([href, label, icon]) => (
        <Link key={href} href={href} className={active(href) ? "on" : ""} aria-current={active(href) ? "page" : undefined}>
          <Icon name={icon} size={variant === "top" ? "sm" : "md"} />
          {label}
          {href === "/cart" && cartCount > 0 && <span className="badge">{cartCount}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Back-office side menu and phone tab strip */
export function StaffNav({ sections, counts, variant }: {
  sections: { id: string; label: string; items: { href: string; label: string; icon: string; badge?: string }[] }[];
  counts: Record<string, number>;
  variant: "side" | "tabs";
}) {
  const path = usePathname();
  const current = sections.find((s) => s.items.some((i) => i.href !== "/admin" && path.startsWith(i.href))) ?? sections[0];
  const items = current?.items ?? [];
  // The active item is the one whose link is the longest match for the current page
  const best = items.filter((i) => path === i.href || path.startsWith(i.href + "/")).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const isOn = (href: string) => href === best;
  if (variant === "tabs") {
    return (
      <nav className="staff-tabs" aria-label="Section">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={isOn(i.href) ? "on" : ""}>
            {i.label}{i.badge && counts[i.badge] ? <span className="cnt">{counts[i.badge]}</span> : null}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <>
      <div className="side-sec">{current?.label}</div>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={`nav ${isOn(i.href) ? "on" : ""}`}>
          <Icon name={i.icon} size="sm" />{i.label}
          {i.badge && counts[i.badge] ? <span className="cnt">{counts[i.badge]}</span> : null}
        </Link>
      ))}
    </>
  );
}

/** Super Admin (or staff with several roles) jumps between workspaces */
export function WorkspaceSwitch({ sections }: { sections: { id: string; label: string; items: { href: string }[] }[] }) {
  const path = usePathname();
  const router = useRouter();
  const current = sections.find((s) => s.items.some((i) => i.href !== "/admin" && path.startsWith(i.href))) ?? sections[0];
  if (sections.length < 2) return <b className="hide-sm">{current?.label}</b>;
  return (
    <div className="ws-switch">
      <label htmlFor="ws">Workspace</label>
      <select id="ws" value={current?.id} onChange={(e) => { const s = sections.find((x) => x.id === e.target.value); if (s) router.push(s.items[0].href); }}>
        {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </div>
  );
}

/**
 * Signs the user out after the idle timeout. Activity (clicks, typing) keeps the session alive;
 * a warning appears 2 minutes before sign-out.
 */
export function IdleWatcher({ idleSeconds, keepAlive, logout, showTimer }: { idleSeconds: number; keepAlive: () => Promise<{ ok: boolean }>; logout: () => Promise<void>; showTimer?: boolean }) {
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const [left, setLeft] = useState(idleSeconds);
  const [warn, setWarn] = useState(false);
  const warnRef = useRef(false);
  useEffect(() => {
    const onAct = () => { if (!warnRef.current) lastActivity.current = Date.now(); };
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, onAct, { passive: true }));
    const t = setInterval(async () => {
      const remaining = Math.max(0, Math.round(idleSeconds - (Date.now() - lastActivity.current) / 1000));
      setLeft(remaining);
      if (remaining <= 120 && !warnRef.current) { warnRef.current = true; setWarn(true); }
      if (remaining === 0) { clearInterval(t); await logout(); }
      if (lastActivity.current > lastPing.current && Date.now() - lastPing.current > 60_000) {
        lastPing.current = Date.now();
        const r = await keepAlive();
        if (!r.ok) window.location.href = "/login";
      }
    }, 1000);
    return () => { clearInterval(t); evs.forEach((e) => window.removeEventListener(e, onAct)); };
  }, [idleSeconds, keepAlive, logout]);
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <>
      {showTimer && <span className={`sess ${left < 120 ? "low" : ""}`} title={`Signs out after ${Math.round(idleSeconds / 60)} minutes without activity`}><Icon name="clock" size="sm" /> {mm}</span>}
      <Dialog open={warn} onClose={() => { /* must choose */ }} title="Still there?" footer={
        <>
          <button className="btn ghost" onClick={() => logout()}>Sign out now</button>
          <button className="btn primary" onClick={async () => { warnRef.current = false; setWarn(false); lastActivity.current = Date.now(); lastPing.current = Date.now(); await keepAlive(); }}>Stay signed in</button>
        </>
      }>
        <p>For security, you&apos;ll be signed out in <b className="tnum">{mm}</b> because of inactivity.</p>
      </Dialog>
    </>
  );
}
