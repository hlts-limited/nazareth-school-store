import type { PayrollStatus } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { PERMISSIONS as P, type NavBadge } from "@/modules/access-control";
import { periodLabel } from "@/modules/payroll";

type Perms = ReadonlySet<string>;
type Counts = Partial<Record<NavBadge, number>>;

/** Variants at or below their item's reorder level, counted in the database (no list of 5,000 items in memory) */
async function lowStockCount() {
  const [r] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "ItemVariant" v JOIN "Item" i ON i.id = v."itemId"
    WHERE i."isActive" AND NOT i."isPile" AND v."onHand" - v."reserved" <= i."reorderLevel"`;
  return Number(r?.n ?? 0);
}

const since = (days: number) => new Date(Date.now() - days * 86400_000);

/**
 * The numbers next to menu links, counted only for what this person can open.
 * Kept for a minute per set of permissions, so moving around the back office doesn't re-count on every page.
 */
const cache = new Map<string, { at: number; value: Counts }>();
export async function navCounts(perms: Perms): Promise<Counts> {
  const key = [...perms].sort().join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const has = (p: string) => perms.has(p);
  const jobs: [NavBadge, Promise<number>][] = [];
  if (has(P.PAYMENTS_REVIEW)) jobs.push(["review", db.order.count({ where: { status: "AWAITING_VERIFICATION" } })]);
  if (has(P.FULFILMENT_MANAGE)) jobs.push(["pack", db.order.count({ where: { status: { in: ["PAYMENT_APPROVED", "PACKING"] } } })]);
  if (has(P.PUPILS_MANAGE)) jobs.push(["bin", db.pupil.count({ where: { deletedAt: { not: null } } })]);
  if (has(P.ADMISSIONS_VIEW)) jobs.push(["apps", db.application.count({ where: { status: "SUBMITTED" } })]);
  if (has(P.WEBSITE_MANAGE)) jobs.push(["enq", db.enquiry.count({ where: { handledAt: null } })]);
  if (has(P.HR_MANAGE) || has(P.HR_BANK_APPROVE)) {
    jobs.push(["hr", Promise.all([
      has(P.HR_MANAGE) ? db.employeeDocument.count({ where: { status: "PENDING" } }) : 0,
      has(P.HR_BANK_APPROVE) ? db.employee.count({ where: { bankStatus: "PENDING" } }) : 0,
    ]).then(([a, b]) => a + b)]);
  }
  if (has(P.ATTENDANCE_MANAGE)) jobs.push(["leave", db.leaveRequest.count({ where: { status: "PENDING" } })]);
  if (has(P.SETTINGS_MANAGE)) jobs.push(["blocked", db.clockAttempt.count({ where: { createdAt: { gte: since(1) } } })]);
  const payrollStatuses: PayrollStatus[] = [
    ...(has(P.PAYROLL_RUN) ? (["DRAFT", "STATUTORY_REVIEWED", "TAX_REVIEWED"] as const) : []),
    ...(has(P.PAYROLL_APPROVE) ? (["DEFAULTS_REVIEWED"] as const) : []),
    ...(has(P.PAYROLL_PAY) ? (["APPROVED"] as const) : []),
  ];
  if (payrollStatuses.length) jobs.push(["payroll", db.payrollRun.count({ where: { status: { in: payrollStatuses } } })]);
  const values = await Promise.all(jobs.map(([, p]) => p));
  const value: Counts = Object.fromEntries(jobs.map(([k], i) => [k, values[i]]));
  cache.set(key, { at: Date.now(), value });
  return value;
}

export type Task = { id: string; title: string; sub?: string; href: string; count?: number; tone: "warn" | "info" | "err" | "ok"; icon: string };

/**
 * Everything waiting for this person, most urgent first: the menu badges as a to-do list, plus their own
 * staff tasks (clock in, finish their profile) and unread messages.
 */
export async function myTasks(v: { user: { id: string }; permissions: Perms }): Promise<Task[]> {
  const perms = v.permissions;
  const has = (p: string) => perms.has(p);
  const c = await navCounts(perms);
  const tasks: Task[] = [];
  const add = (t: Task) => { if (t.count === undefined || t.count > 0) tasks.push(t); };

  // Payroll: say which month and what is needed
  if (c.payroll) {
    const runs = await db.payrollRun.findMany({ where: { status: { in: ["DRAFT", "STATUTORY_REVIEWED", "TAX_REVIEWED", "DEFAULTS_REVIEWED", "APPROVED"] } }, orderBy: { period: "asc" }, select: { period: true, status: true, preparerIds: true } });
    for (const r of runs) {
      const href = `/admin/payroll/${r.period}`;
      if (r.status === "APPROVED" && has(P.PAYROLL_PAY)) add({ id: `pay-${r.period}`, title: `Pay ${periodLabel(r.period)} salaries`, sub: "Approved and ready to pay through Paystack", href, tone: "err", icon: "wallet" });
      else if (r.status === "DEFAULTS_REVIEWED" && has(P.PAYROLL_APPROVE)) {
        add(r.preparerIds.includes(v.user.id)
          ? { id: `approve-${r.period}`, title: `${periodLabel(r.period)} payroll is waiting for approval`, sub: "You prepared it, so another Super Admin must approve it", href, tone: "info", icon: "wallet" }
          : { id: `approve-${r.period}`, title: `Approve ${periodLabel(r.period)} payroll`, sub: "All three stages are reviewed", href, tone: "err", icon: "wallet" });
      } else if (["DRAFT", "STATUTORY_REVIEWED", "TAX_REVIEWED"].includes(r.status) && has(P.PAYROLL_RUN)) {
        const stage = r.status === "DRAFT" ? 1 : r.status === "STATUTORY_REVIEWED" ? 2 : 3;
        add({ id: `prepare-${r.period}`, title: `Finish ${periodLabel(r.period)} payroll`, sub: `Stage ${stage} of 3 is open`, href, tone: "warn", icon: "wallet" });
      }
    }
  }
  add({ id: "review", title: "Payment receipts to check", sub: "Older bank-transfer orders", href: "/admin/accounts/review", count: c.review, tone: "err", icon: "receipt" });
  add({ id: "pack", title: "Paid orders to pack", href: "/admin/store/packing", count: c.pack, tone: "warn", icon: "box" });
  if (has(P.FULFILMENT_MANAGE)) add({ id: "pickup", title: "Orders ready, waiting to be collected", href: "/admin/store/pickup", count: await db.order.count({ where: { status: { in: ["READY", "PARTIALLY_HANDED_OUT"] } } }), tone: "info", icon: "qr" });
  if (has(P.STOCK_MANAGE)) add({ id: "stock", title: "Items low on stock", sub: "At or below their reorder level", href: "/admin/store/stock", count: await lowStockCount(), tone: "warn", icon: "tag" });
  add({ id: "hr", title: "Staff documents and bank details to review", href: "/admin/hr/reviews", count: c.hr, tone: "warn", icon: "check" });
  add({ id: "leave", title: "Leave requests to decide", href: "/admin/attendance/leave", count: c.leave, tone: "warn", icon: "file" });
  add({ id: "blocked", title: "Blocked clock-ins in the last 24 hours", href: "/admin/attendance/blocked", count: c.blocked, tone: "err", icon: "alert" });
  add({ id: "apps", title: "New admission applications", href: "/admin/admissions", count: c.apps, tone: "info", icon: "file" });
  add({ id: "enq", title: "Website messages to answer", href: "/admin/website", count: c.enq, tone: "info", icon: "mail" });

  // The person's own staff tasks
  if (has(P.SELF_SERVICE)) {
    const { myEmployee } = await import("@/modules/hr");
    const { nextClock } = await import("@/modules/attendance");
    const e = await myEmployee(v.user.id);
    if (e && e.status === "ACTIVE") {
      const next = await nextClock(e.id);
      if (next === "in") add({ id: "clock", title: "Clock in for today", href: "/admin/me/clock", tone: "info", icon: "qr" });
      if (!e.onboarding.complete) add({ id: "profile", title: "Finish your staff profile", sub: e.onboarding.steps.filter((s) => !s.done).map((s) => s.label).join(" · "), href: "/admin/me", tone: "warn", icon: "users" });
    }
  }
  const unread = await db.notification.count({ where: { userId: v.user.id, readAt: null } });
  add({ id: "unread", title: "Unread notifications", href: "/admin/notifications", count: unread, tone: "info", icon: "bell" });
  const order = { err: 0, warn: 1, info: 2, ok: 3 };
  return tasks.sort((a, b) => order[a.tone] - order[b.tone]);
}
