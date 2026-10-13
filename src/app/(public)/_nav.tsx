"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/shared/ui/icon";

type NavItem = { label: string; href: string; children?: { label: string; href: string }[] };

/** Public website menu: inline on desktop, a slide-down panel on phones */
export function PublicNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const active = (item: NavItem) =>
    item.href === "/" ? path === "/" : [item.href, ...(item.children ?? []).map((c) => c.href)].some((h) => path === h || path.startsWith(h + "/"));

  return (
    <>
      <button type="button" className="icon-btn pub-menu-btn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="pub-nav" onClick={() => setOpen(!open)}>
        <Icon name={open ? "x" : "menu"} />
      </button>
      <nav id="pub-nav" className={`pub-nav ${open ? "open" : ""}`} aria-label="Website">
        {items.map((item) =>
          item.children ? (
            <details key={item.href} className={`pub-dd ${active(item) ? "on" : ""}`}>
              <summary>{item.label}<Icon name="chev" size="sm" /></summary>
              <div className="pub-dd-menu">
                {item.children.map((c) => (
                  <Link key={c.href} href={c.href} aria-current={path === c.href ? "page" : undefined}>{c.label}</Link>
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
