"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/shared/ui/icon";

type NavItem = { label: string; href: string; children?: { label: string; href: string }[] };

/**
 * Public website menu: inline on desktop, a slide-down panel on phones.
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
      if (ref.current?.contains(e.target as Node) || (e.target as Element).closest?.(".pub-menu-btn")) return;
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
      <nav ref={ref} id="pub-nav" className={`pub-nav ${open ? "open" : ""}`} aria-label="Website">
        {items.map((item) =>
          item.children ? (
            <details key={item.href} data-dd={item.href} className={`pub-dd ${active(item) ? "on" : ""}`} open={dropdown === item.href}>
              {/* The menu decides which dropdown is open, so opening one closes the others */}
              <summary onClick={(e) => { e.preventDefault(); setDropdown(dropdown === item.href ? null : item.href); }}>
                {item.label}<Icon name="chev" size="sm" />
              </summary>
              <div className="pub-dd-menu">
                {item.children.map((c) => (
                  <Link key={c.href} href={c.href} aria-current={path === c.href ? "page" : undefined} onClick={() => setDropdown(null)}>{c.label}</Link>
                ))}
              </div>
            </details>
          ) : (
            <Link key={item.href} href={item.href} className={active(item) ? "on" : ""} aria-current={active(item) ? "page" : undefined}>{item.label}</Link>
          ),
        )}
      </nav>
    </>
  );
}
