"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import { Dialog } from "./client";

/** Pages that need their own page load (camera and location are only allowed on them) */
const FULL_LOAD = new Set(["/admin/me/clock", "/admin/attendance/settings"]);

/** Parent menu bar (laptops and tablets) + phone bottom bar, with the active tab highlighted */
export function ParentNav({ cartCount, variant }: { cartCount: number; variant: "top" | "bottom" }) {
  const path = usePathname();
  const tabs: [string, string, string][] = [["/home", "Home", "home"], ["/shop", "Shop", "shop"], ["/cart", "Cart", "cart"], ["/orders", "Orders", "box"], ["/wallet", "Wallet", "wallet"]];
  const active = (href: string) => path === href || path.startsWith(href + "/");
  return (
    <nav className={variant === "top" ? "topnav mbar" : "bottomnav"} aria-label="Main">
      {tabs.map(([href, label, icon]) => {
        const badge = href === "/cart" && cartCount > 0 && <span className="badge">{cartCount}</span>;
        return variant === "top" ? (
          <Link key={href} href={href} className={`mb-i ${active(href) ? "on" : ""}`} aria-current={active(href) ? "page" : undefined}>
            <span className="mb-l">{label}</span>
            <span className="mb-ic"><Icon name={icon} size="sm" />{badge}</span>
          </Link>
        ) : (
          <Link key={href} href={href} className={active(href) ? "on" : ""} aria-current={active(href) ? "page" : undefined}>
            <Icon name={icon} size="md" />
            {label}
            {badge}
          </Link>
        );
      })}
    </nav>
  );
}

/** The workspace whose link best matches the page (longest match), so /admin is Super Admin's Overview and
 *  /admin/alpha/... is Alpha's, even for an account that has both. */
function currentSection<S extends { items: { href: string }[] }>(sections: S[], path: string): S | undefined {
  let best: S | undefined;
  let len = -1;
  for (const s of sections) for (const i of s.items) {
    if ((path === i.href || path.startsWith(i.href + "/")) && i.href.length > len) { best = s; len = i.href.length; }
  }
  return best ?? sections[0];
}

/** Back-office side menu: the current workspace's links. Labels hide when the menu is folded to icons. */
export function StaffNav({ sections, counts }: {
  sections: { id: string; label: string; items: { href: string; label: string; icon: string; badge?: string }[] }[];
  counts: Record<string, number>;
}) {
  const path = usePathname();
  const current = currentSection(sections, path);
  const items = current?.items ?? [];
  // The active item is the one whose link is the longest match for the current page
  const best = items.filter((i) => path === i.href || path.startsWith(i.href + "/")).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <>
      <div className="side-sec">Menu{sections.length > 1 && <span className="side-l"> · {current?.label}</span>}</div>
      {items.map((i) => {
        const n = i.badge ? counts[i.badge] : 0;
        const inner = <><Icon name={i.icon} size="sm" /><span className="side-l">{i.label}</span>{n ? <span className="cnt">{n}</span> : null}</>;
        const props = { className: `nav ${i.href === best ? "on" : ""}`, "aria-current": i.href === best ? ("page" as const) : undefined, title: i.label };
        // Clock-in and attendance settings are the only pages allowed location (see next.config.ts). Browsers decide
        // that per page load, so these links load the page fresh instead of switching to it in place.
        return FULL_LOAD.has(i.href) ? <a key={i.href} href={i.href} {...props}>{inner}</a> : <Link key={i.href} href={i.href} {...props}>{inner}</Link>;
      })}
    </>
  );
}

/**
 * The staff side menu. On laptops it is full width and folds to an icon rail (remembered on this device);
 * on phones it is always the rail, and the logo button opens it out over the page.
 */
export function StaffSide({ name, children }: { name: string; children: React.ReactNode }) {
  const path = usePathname();
  const [folded, setFolded] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setFolded(localStorage.getItem("nz-side") === "folded"); } catch {} }, []);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const toggle = () => {
    if (window.matchMedia("(max-width:980px)").matches) { setOpen(!open); return; }
    const next = !folded;
    setFolded(next);
    try { localStorage.setItem("nz-side", next ? "folded" : "open"); } catch {}
  };
  const wide = open || !folded;
  return (
    <>
      <aside className={`side ${folded ? "folded" : ""} ${open ? "open" : ""}`} aria-label="Staff menu">
        <div className="side-head">
          <button type="button" className="side-logo" onClick={toggle} aria-expanded={wide} aria-label={wide ? "Fold the menu" : "Open the menu"} title={wide ? "Fold the menu" : "Open the menu"}>
            <Image src="/logo.png" alt="" width={30} height={30} />
          </button>
          <b className="side-l side-name">{name}</b>
        </div>
        {children}
      </aside>
      {open && <div className="side-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
    </>
  );
}

/** Super Admin (or staff with several roles) jumps between workspaces */
export function WorkspaceSwitch({ sections }: { sections: { id: string; label: string; items: { href: string }[] }[] }) {
  const path = usePathname();
  const router = useRouter();
  const current = currentSection(sections, path);
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
