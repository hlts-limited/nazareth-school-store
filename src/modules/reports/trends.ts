// Day-by-day series for the animated overview charts (see src/shared/ui/charts.tsx)
import { db } from "@/shared/lib/db";
import { PAID_STATUSES } from "@/modules/orders";

export type ChartMarker = { at: number; title: string; sub?: string; note?: string };
export type Trend = { labels: string[]; series: { name: string; values: number[] }[]; bars?: number[]; warn?: number[]; markers: ChartMarker[] };

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const isWeekend = (key: string) => [0, 6].includes(new Date(`${key}T12:00:00Z`).getUTCDay());
const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/** The last `n` Lagos days, oldest first, and the instant the first one starts */
function lastDays(n: number, now = new Date()) {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(dayKey(new Date(now.getTime() - i * 86400_000)));
  return { keys, labels: keys.map(dayLabel), since: new Date(`${keys[0]}T00:00:00+01:00`) };
}

/** Collects values into one line per name, one bucket per day */
function bucketer(keys: string[]) {
  const at = new Map(keys.map((k, i) => [k, i]));
  const series = new Map<string, number[]>();
  return {
    add(name: string, when: Date, v: number) {
      const i = at.get(dayKey(when));
      if (i === undefined) return;
      if (!series.has(name)) series.set(name, keys.map(() => 0));
      series.get(name)![i] += v;
    },
    index: (when: Date) => at.get(dayKey(when)),
    /** The lines in `order` (those with any data), or all of them */
    get: (order?: string[]) => (order ? order.filter((n) => series.has(n)) : [...series.keys()]).map((name) => ({ name, values: series.get(name)! })),
  };
}

const sumAt = (series: { values: number[] }[], i: number) => series.reduce((a, s) => a + s.values[i], 0);
const total = (s: { values: number[] }) => s.values.reduce((a, b) => a + b, 0);

function busiest(series: { values: number[] }[], n: number) {
  let best = 0, at = -1;
  for (let i = 0; i < n; i++) { const v = sumAt(series, i); if (v > best) { best = v; at = i; } }
  return at >= 0 ? { at, value: best } : null;
}

/** School days well below the period's average (weekends and today are left out) */
function quietDays(keys: string[], series: { values: number[] }[]) {
  const totals = keys.map((_, i) => sumAt(series, i));
  const active = totals.filter((t, i) => !isWeekend(keys[i]) && t > 0);
  if (active.length < 3) return [];
  const avg = active.reduce((a, b) => a + b, 0) / active.length;
  return keys.flatMap((k, i) => (!isWeekend(k) && i < keys.length - 1 && totals[i] < avg * 0.35 ? [i] : []));
}

const today = (labels: string[], series: { values: number[] }[], note: (v: number) => string): ChartMarker =>
  ({ at: labels.length - 1, title: "Today", sub: labels[labels.length - 1], note: note(sumAt(series, labels.length - 1)) });

/** Super Admin: paid store sales per day, one line per class; cancelled orders as red bars; quiet school days in amber */
export async function salesTrend(days = 30): Promise<Trend> {
  const { keys, labels, since } = lastDays(days);
  const [classes, lines, cancelled] = await Promise.all([
    db.class.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.orderLine.findMany({
      where: { order: { status: { in: PAID_STATUSES }, createdAt: { gte: since } } },
      select: { qty: true, unitPrice: true, order: { select: { createdAt: true } }, pupil: { select: { classId: true } } },
    }),
    db.order.findMany({ where: { status: "CANCELLED", cancelledAt: { gte: since } }, select: { cancelledAt: true } }),
  ]);
  const name = new Map(classes.map((c) => [c.id, c.name]));
  const b = bucketer(keys);
  for (const l of lines) b.add(name.get(l.pupil.classId) ?? "Other", l.order.createdAt, l.qty * l.unitPrice);
  const series = b.get([...classes.map((c) => c.name), "Other"]);
  const bars = keys.map(() => 0);
  for (const o of cancelled) { const i = b.index(o.cancelledAt!); if (i !== undefined) bars[i]++; }
  const markers: ChartMarker[] = [];
  const top = busiest(series, keys.length);
  if (top && top.at !== keys.length - 1) markers.push({ at: top.at, title: "Busiest day", sub: labels[top.at], note: naira(top.value) });
  markers.push(today(labels, series, naira));
  return { labels, series, bars, warn: quietDays(keys, series), markers };
}

/** Accountant: money received per day by method; rejected payments as red bars and amber days */
export async function moneyTrend(days = 30): Promise<Trend & { reviewedIn24h: number | null; reviewed: number }> {
  const { keys, labels, since } = lastDays(days);
  const METHOD = { PAYSTACK: "Paystack", TRANSFER: "Bank transfer", WALLET: "Wallet" } as const;
  const inWindow = { OR: [{ verifiedAt: { gte: since } }, { verifiedAt: null, createdAt: { gte: since } }] };
  const [ok, rejected, transfers] = await Promise.all([
    db.payment.findMany({
      where: { status: { in: ["APPROVED", "PART_PAID"] }, ...inWindow },
      select: { method: true, amountDue: true, amountReceived: true, verifiedAt: true, createdAt: true },
    }),
    db.payment.findMany({ where: { status: "REJECTED", ...inWindow }, select: { verifiedAt: true, createdAt: true } }),
    db.payment.findMany({
      where: { method: "TRANSFER", verifiedAt: { gte: since } },
      select: { verifiedAt: true, receipts: { select: { uploadedAt: true }, orderBy: { uploadedAt: "asc" }, take: 1 } },
    }),
  ]);
  const b = bucketer(keys);
  for (const p of ok) b.add(METHOD[p.method], p.verifiedAt ?? p.createdAt, p.amountReceived ?? p.amountDue);
  const series = b.get(Object.values(METHOD));
  const bars = keys.map(() => 0);
  for (const p of rejected) { const i = b.index(p.verifiedAt ?? p.createdAt); if (i !== undefined) bars[i]++; }

  // How quickly transfer receipts were checked: from the first receipt upload to the decision
  const timed = transfers.filter((t) => t.receipts[0]);
  const fast = timed.filter((t) => t.verifiedAt!.getTime() - t.receipts[0].uploadedAt.getTime() <= 24 * 3600_000).length;

  const markers: ChartMarker[] = [];
  const top = busiest(series, keys.length);
  if (top && top.at !== keys.length - 1) markers.push({ at: top.at, title: "Biggest day", sub: labels[top.at], note: naira(top.value) });
  const last = ok.filter((p) => p.verifiedAt).sort((a, z) => z.verifiedAt!.getTime() - a.verifiedAt!.getTime())[0];
  const lastAt = last ? b.index(last.verifiedAt!) : undefined;
  if (last && lastAt !== undefined && lastAt !== top?.at && lastAt !== keys.length - 1) {
    markers.push({ at: lastAt, title: "Last approval", sub: labels[lastAt], note: naira(last.amountReceived ?? last.amountDue) });
  }
  markers.push(today(labels, series, naira));
  return {
    labels, series, bars, markers: markers.sort((a, z) => a.at - z.at),
    warn: bars.flatMap((n, i) => (n > 0 ? [i] : [])),
    reviewedIn24h: timed.length ? Math.round((fast / timed.length) * 100) : null, reviewed: timed.length,
  };
}

/** Registrar: items sold per day by top-level category, stock health, and the oldest order waiting for pick-up */
export async function storeTrend(days = 30): Promise<Trend & { healthy: number; tracked: number; oldestReady: Date | null }> {
  const { keys, labels, since } = lastDays(days);
  const [lines, variants, restock, oldestReady] = await Promise.all([
    db.orderLine.findMany({
      where: { order: { status: { in: PAID_STATUSES }, createdAt: { gte: since } } },
      select: { qty: true, order: { select: { createdAt: true } }, variant: { select: { item: { select: { category: { select: { name: true, parent: { select: { name: true } } } } } } } } },
    }),
    db.itemVariant.findMany({ where: { item: { isActive: true, isPile: false } }, select: { onHand: true, reserved: true, item: { select: { reorderLevel: true } } } }),
    db.stockMovement.findFirst({ where: { type: "RESTOCK", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { createdAt: true, qty: true } }),
    db.order.findFirst({ where: { status: { in: ["READY", "PARTIALLY_HANDED_OUT"] } }, orderBy: { updatedAt: "asc" }, select: { updatedAt: true } }),
  ]);
  const b = bucketer(keys);
  for (const l of lines) { const c = l.variant.item.category; b.add(c.parent?.name ?? c.name, l.order.createdAt, l.qty); }
  const series = b.get().sort((a, z) => total(z) - total(a));
  const items = (v: number) => `${v} item${v === 1 ? "" : "s"}`;
  const markers: ChartMarker[] = [];
  const top = busiest(series, keys.length);
  if (top && top.at !== keys.length - 1) markers.push({ at: top.at, title: "Busiest day", sub: labels[top.at], note: items(top.value) });
  const r = restock ? b.index(restock.createdAt) : undefined;
  if (restock && r !== undefined && r !== top?.at && r !== keys.length - 1) markers.push({ at: r, title: "Last restock", sub: labels[r], note: `+${restock.qty}` });
  markers.push(today(labels, series, items));
  return {
    labels, series, markers: markers.sort((a, z) => a.at - z.at),
    healthy: variants.filter((v) => v.onHand - v.reserved > v.item.reorderLevel).length, tracked: variants.length,
    oldestReady: oldestReady?.updatedAt ?? null,
  };
}

/** Alpha: activity per day; failed sign-ins as red bars, amber on days with 5 or more */
export async function activityTrend(days = 30): Promise<Trend> {
  const { keys, labels, since } = lastDays(days);
  const [audits, sessions, orders, failed, backup] = await Promise.all([
    db.auditLog.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.session.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.loginAttempt.findMany({ where: { success: false, createdAt: { gte: since }, NOT: { key: { startsWith: "enquiry:" } } }, select: { createdAt: true } }),
    db.backup.findFirst({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const b = bucketer(keys);
  for (const a of audits) b.add("Changes logged", a.createdAt, 1);
  for (const s of sessions) b.add("Sign-ins", s.createdAt, 1);
  for (const o of orders) b.add("Orders", o.createdAt, 1);
  const series = b.get(["Changes logged", "Sign-ins", "Orders"]);
  const bars = keys.map(() => 0);
  for (const f of failed) { const i = b.index(f.createdAt); if (i !== undefined) bars[i]++; }
  const events = (v: number) => `${v} event${v === 1 ? "" : "s"}`;
  const markers: ChartMarker[] = [];
  const bi = backup ? b.index(backup.createdAt) : undefined;
  if (bi !== undefined && bi !== keys.length - 1) markers.push({ at: bi, title: "Last backup", sub: labels[bi] });
  const top = busiest(series, keys.length);
  if (top && top.at !== keys.length - 1 && top.at !== bi) markers.push({ at: top.at, title: "Busiest day", sub: labels[top.at], note: events(top.value) });
  markers.push(today(labels, series, events));
  return { labels, series, bars, markers: markers.sort((a, z) => a.at - z.at), warn: bars.flatMap((n, i) => (n >= 5 ? [i] : [])) };
}

/** Attendance: how staff arrived through the morning, a running count per section in 10-minute steps; amber after the late time */
export function morningCurve(rows: { section: string; sectionName: string; name: string; clockInAt: Date | null }[], lateCutoff: string): Trend {
  const hm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const ins = rows.filter((r) => r.clockInAt).map((r) => ({ ...r, m: mins(hm(r.clockInAt!)) })).sort((a, z) => a.m - z.m);
  const cut = mins(lateCutoff);
  const from = Math.floor(Math.min(cut - 90, ins[0]?.m ?? cut) / 10) * 10 - 10;
  const to = Math.ceil(Math.max(cut + 60, (ins.at(-1)?.m ?? cut) + 10) / 10) * 10;
  const steps: number[] = [];
  for (let m = from; m <= to; m += 10) steps.push(m);
  const sections = [...new Map(rows.map((r) => [r.section, r.sectionName])).entries()];
  const series = sections
    .map(([id, name]) => ({ name, values: steps.map((m) => ins.filter((r) => r.section === id && r.m <= m).length) }))
    .filter((s) => s.values[s.values.length - 1] > 0);
  const at = (m: number) => { const i = steps.findIndex((s) => s >= m); return i < 0 ? steps.length - 1 : i; };
  const markers: ChartMarker[] = [];
  if (ins[0]) markers.push({ at: at(ins[0].m), title: "First in", sub: fmt(ins[0].m), note: ins[0].name });
  markers.push({ at: at(cut), title: "Late after", sub: lateCutoff });
  if (ins.length > 1) markers.push({ at: at(ins[ins.length - 1].m), title: "Last in", sub: fmt(ins[ins.length - 1].m), note: ins[ins.length - 1].name });
  return { labels: steps.map(fmt), series, markers: markers.sort((a, z) => a.at - z.at), warn: steps.flatMap((m, i) => (m > cut ? [i] : [])) };
}
