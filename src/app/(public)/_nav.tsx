"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";

type NavItem = { label: string; href: string; icon: string; children?: { label: string; href: string }[] };

/**
 * Public website menu: a menu bar on laptops and tablets (label above a round icon), a dark slide-out menu on phones.
 * Only one dropdown is open at a time; it closes on a click elsewhere, on Escape, and when the page changes.
 */
export function PublicNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [dropdown, setDropdown] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => { setOpen(false); setDropdown(null); }, [path]);

  useEffect(() => {
    if (!dropdown && !open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) || (e.target as Element).closest?.(".pub-menu-btn,.pub-scrim")) return;
      setDropdown(null);
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dropdown) {
        const summary = ref.current?.querySelector<HTMLElement>(`[data-dd="${dropdown}"] > summary`);
        setDropdown(null);
        summary?.focus();
      } else setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [dropdown, open]);

  const active = (item: NavItem) =>
    item.href === "/" ? path === "/" : [item.href, ...(item.children ?? []).map((c) => c.href)].some((h) => path === h || path.startsWith(h + "/"));

  return (
    <>
      <button type="button" className={`icon-btn pub-menu-btn ${open ? "is-open" : ""}`} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="pub-nav" onClick={() => { setOpen(!open); setDropdown(null); }}>
        <Icon name={open ? "x" : "menu"} />
      </button>
      {open && <div className="pub-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <nav ref={ref} id="pub-nav" className={`pub-nav mbar ${open ? "open" : ""}`} aria-label="Website">
        <div className="pub-drawer-head">
          <span className="side-logo"><Image src="/logo.png" alt="" width={30} height={30} /></span>
          <b>{SCHOOL.name}</b>
          <button type="button" className="pub-drawer-x" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="x" size="sm" /></button>
        </div>
        <div className="pub-drawer-sec">Menu</div>
        {items.map((item) =>
          item.children ? (
            <details key={item.href} data-dd={item.href} className={`pub-dd ${active(item) ? "on" : ""}`} open={dropdown === item.href}>
              {/* The menu decides which dropdown is open, so opening one closes the others */}
              <summary className="mb-i" onClick={(e) => { e.preventDefault(); setDropdown(dropdown === item.href ? null : item.href); }}>
                <span className="mb-l">{item.label}<Icon name="chev" size="sm" /></span>
                <span className="mb-ic"><Icon name={item.icon} size="sm" /></span>
              </summary>
              <div className="pub-dd-menu">
                {item.children.map((c) => (
                  <Link key={c.href} href={c.href} aria-current={path === c.href ? "page" : undefined} onClick={() => setDropdown(null)}>{c.label}</Link>
                ))}
              </div>
            </details>
          ) : (
            <Link key={item.href} href={item.href} className={`mb-i ${active(item) ? "on" : ""}`} aria-current={active(item) ? "page" : undefined}>
              <span className="mb-l">{item.label}</span>
              <span className="mb-ic"><Icon name={item.icon} size="sm" /></span>
            </Link>
          ),
        )}
      </nav>
    </>
  );
}

/** Laptops and tablets: the sign-in buttons live behind one menu button at the right of the header. */
export function SignInMenu() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); ref.current?.querySelector<HTMLElement>("button")?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="signin-menu" ref={ref}>
      <button type="button" className={`icon-btn signin-btn ${open ? "is-open" : ""}`} aria-label={open ? "Close sign-in menu" : "Sign in"} aria-expanded={open} aria-controls="signin-panel" title="Sign in" onClick={() => setOpen(!open)}>
        <Icon name={open ? "x" : "menu"} />
      </button>
      {open && (
        <div className="signin-panel" id="signin-panel">
          <div className="pub-drawer-sec">Sign in</div>
          <Link href="/login" className="signin-opt">
            <span className="signin-ic"><Icon name="users" size="sm" /></span>
            <span><b>Parents and pupils</b><small>School Store, booklists and orders</small></span>
          </Link>
          <Link href="/staff/login" className="signin-opt">
            <span className="signin-ic"><Icon name="shield" size="sm" /></span>
            <span><b>Staff</b><small>Back office, clock-in and payslips</small></span>
          </Link>
        </div>
      )}
    </div>
  );
}
