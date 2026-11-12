import Link from "next/link";
import { canOpen, SETTINGS_TABS } from "@/modules/access-control";
import type { StaffViewer } from "@/modules/auth";

/** The tabs across the top of every settings page: one Settings area, showing only the tabs this person can open. */
export function SettingsTabs({ v, current }: { v: StaffViewer; current: string }) {
  const tabs = SETTINGS_TABS.filter((t) => canOpen(v.permissions, t.perm));
  if (tabs.length < 2) return null;
  return (
    <nav className="seg tabs-nav" aria-label="Settings">
      {tabs.map((t) => <Link key={t.href} href={t.href} className={t.href === current ? "on" : ""} aria-current={t.href === current ? "page" : undefined}>{t.label}</Link>)}
    </nav>
  );
}
