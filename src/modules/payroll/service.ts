import type { PayrollStatus, Prisma } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { attendanceSettings, monthTotals } from "@/modules/attendance";
import { DEFAULT_RATES, payAfterTax, penalties, schoolDaysIn, statutory, tax, type Overrides, type PayrollRates, type Statutory, type TaxResult } from "./engine";

// ---------- Rates (settings) ----------

const KEY = "payroll";

export async function payrollRates(): Promise<PayrollRates> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  return { ...DEFAULT_RATES, ...((row?.value ?? {}) as Partial<PayrollRates>) };
}

export async function savePayrollRates(patch: Partial<PayrollRates>) {
  const value = { ...(await payrollRates()), ...patch };
  if (value.taxBands.length < 1 || value.taxBands.at(-1)!.upToNaira !== null) throw new UserError("The last tax band must have no upper limit.");
  for (let i = 1; i < value.taxBands.length - 1; i++) {
    if ((value.taxBands[i].upToNaira ?? 0) <= (value.taxBands[i - 1].upToNaira ?? 0)) throw new UserError("Each tax band must end above the one before it.");
  }
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
  return value;
}

// ---------- Runs ----------

export type Actor = { id: string; name: string };
export const STAGE_ORDER: PayrollStatus[] = ["DRAFT", "STATUTORY_REVIEWED", "TAX_REVIEWED", "DEFAULTS_REVIEWED", "APPROVED", "PAID", "LOCKED"];
const at = (s: PayrollStatus) => STAGE_ORDER.indexOf(s);
const OPEN: PayrollStatus[] = ["DRAFT", "STATUTORY_REVIEWED", "TAX_REVIEWED", "DEFAULTS_REVIEWED"];

export const monthEnd = (period: string) => { const [y, m] = period.split("-").map(Number); return new Date(Date.UTC(y, m, 0)); };
export const periodLabel = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export async function startRun(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new UserError("Choose the month.");
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (period > thisMonth) throw new UserError("You can't start payroll for a future month.");
  if (await db.payrollRun.findUnique({ where: { period } })) throw new UserError(`Payroll for ${periodLabel(period)} has already been started.`);
  return db.payrollRun.create({ data: { period } });
}

export const runByPeriod = (period: string) => db.payrollRun.findUnique({
  where: { period },
  include: { items: { include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } }, orderBy: { employee: { staffCode: "asc" } } } },
});

export const listRuns = () => db.payrollRun.findMany({ orderBy: { period: "desc" }, include: { _count: { select: { items: true } } } });

const addPreparer = (ids: string[], id: string) => (ids.includes(id) ? ids : [...ids, id]);

async function openRun(runId: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (!OPEN.includes(run.status)) throw new UserError("This run has been approved, so its figures can't change. The Proprietor can send it back if needed.");
  return run;
}

/** Any change to salaries or statutory switches sends open runs back to stage 1, so nobody approves stale figures. */
export async function resetOpenRuns(to: "DRAFT" | "TAX_REVIEWED", periods?: string[]) {
  const runs = await db.payrollRun.findMany({ where: { status: { in: OPEN }, ...(periods ? { period: { in: periods } } : {}) } });
  for (const r of runs) {
    if (at(r.status) <= at(to)) continue;
    await db.payrollRun.update({ where: { id: r.id }, data: to === "DRAFT"
      ? { status: "DRAFT", statutoryRevBy: null, statutoryRevAt: null, taxCalcAt: null, taxCalcBy: null, taxRevAt: null, taxRevBy: null, defaultsCalcAt: null, defaultsCalcBy: null, defaultsRevAt: null, defaultsRevBy: null }
      : { status: "TAX_REVIEWED", defaultsCalcAt: null, defaultsCalcBy: null, defaultsRevAt: null, defaultsRevBy: null } });
  }
}

// ---------- Stage 1: statutory ----------

type StatLines = { statutory: Statutory; overrides: Overrides };

async function computeStatutory(period: string, rates: PayrollRates) {
  const staff = await db.employee.findMany({ where: { status: "ACTIVE", hireDate: { lte: monthEnd(period) } }, orderBy: { staffCode: "asc" } });
  return staff.map((e) => {
    const o = (e.statutoryOverrides ?? {}) as Overrides;
    const s = statutory(e.monthlyGrossKobo, e.annualRentNaira, rates, o);
    const held = e.bankStatus !== "VERIFIED" ? (e.bankStatus === "NONE" ? "No bank details" : e.bankStatus === "PENDING" ? "Bank details not yet verified" : "Bank details rejected") : null;
    return { e, s, o, held };
  });
}

export async function calcStatutory(runId: string, by: Actor) {
  const run = await openRun(runId);
  const rates = await payrollRates();
  const rows = await computeStatutory(run.period, rates);
  if (!rows.length) throw new UserError("There are no active staff for this month.");
  await db.$transaction(async (tx) => {
    await tx.payrollItem.deleteMany({ where: { runId, employeeId: { notIn: rows.map((r) => r.e.id) } } });
    for (const { e, s, o, held } of rows) {
      const data = {
        grossKobo: s.monthly.gross, pensionKobo: s.monthly.pension, nhfKobo: s.monthly.nhf, nhisKobo: s.monthly.nhis, taxKobo: 0, penaltiesKobo: 0, carryKobo: 0, netKobo: 0,
        held: !!held, heldReason: held, lines: { statutory: s, overrides: o } as unknown as Prisma.InputJsonValue,
      };
      await tx.payrollItem.upsert({ where: { runId_employeeId: { runId, employeeId: e.id } }, create: { runId, employeeId: e.id, ...data }, update: data });
    }
    await tx.payrollRun.update({ where: { id: runId }, data: {
      status: "DRAFT", rates: rates as unknown as Prisma.InputJsonValue, statutoryCalcBy: by.name, statutoryCalcAt: new Date(), statutoryRevBy: null, statutoryRevAt: null,
      taxCalcBy: null, taxCalcAt: null, taxRevBy: null, taxRevAt: null, defaultsCalcBy: null, defaultsCalcAt: null, defaultsRevBy: null, defaultsRevAt: null,
      preparerIds: addPreparer(run.preparerIds, by.id),
    } });
  });
  return rows.length;
}

// ---------- Stage 2: tax ----------

const ratesOf = (run: { rates: Prisma.JsonValue }) => (run.rates ?? DEFAULT_RATES) as unknown as PayrollRates;

export async function calcTax(runId: string, by: Actor) {
  const run = await openRun(runId);
  if (at(run.status) < at("STATUTORY_REVIEWED")) throw new UserError("Mark stage 1 reviewed first.");
  const items = await db.payrollItem.findMany({ where: { runId } });
  const bands = ratesOf(run).taxBands;
  await db.$transaction(async (tx) => {
    for (const it of items) {
      const l = it.lines as unknown as StatLines;
      const t = tax(l.statutory.taxable, bands);
      await tx.payrollItem.update({ where: { id: it.id }, data: { taxKobo: t.monthly, penaltiesKobo: 0, carryKobo: 0, netKobo: 0, lines: { statutory: l.statutory, overrides: l.overrides, tax: t } as unknown as Prisma.InputJsonValue } });
    }
    await tx.payrollRun.update({ where: { id: runId }, data: {
      status: "STATUTORY_REVIEWED", taxCalcBy: by.name, taxCalcAt: new Date(), taxRevBy: null, taxRevAt: null,
      defaultsCalcBy: null, defaultsCalcAt: null, defaultsRevBy: null, defaultsRevAt: null, preparerIds: addPreparer(run.preparerIds, by.id),
    } });
  });
}

// ---------- Stage 3: penalties ----------

async function computeDefaults(run: { id: string; period: string; rates: Prisma.JsonValue }) {
  const rates = ratesOf(run);
  const [items, totals, aset, holidays, adjustments, prev] = await Promise.all([
    db.payrollItem.findMany({ where: { runId: run.id } }),
    monthTotals(run.period),
    attendanceSettings(),
    db.holiday.findMany({ where: { date: { gte: new Date(`${run.period}-01T00:00:00Z`), lte: monthEnd(run.period) } } }),
    db.payrollAdjustment.findMany({ where: { period: run.period } }),
    db.payrollRun.findFirst({ where: { period: { lt: run.period }, status: { in: ["APPROVED", "PAID", "LOCKED"] } }, orderBy: { period: "desc" }, include: { items: true } }),
  ]);
  const schoolDays = schoolDaysIn(run.period, aset.workDays, holidays.map((h) => h.date.toISOString().slice(0, 10)));
  return items.map((it) => {
    const l = it.lines as unknown as StatLines & { tax: TaxResult };
    const t = totals.get(it.employeeId);
    const mine = adjustments.filter((a) => a.employeeId === it.employeeId);
    const p = penalties(it.grossKobo, payAfterTax(l.statutory, l.tax), {
      lateDays: t?.LATE ?? 0, absentDays: t?.ABSENT ?? 0, schoolDays,
      manual: mine.filter((a) => a.kind === "penalty").map((a) => ({ amountKobo: a.amountKobo, reason: a.reason })),
      waivers: mine.filter((a) => a.kind === "waiver").map((a) => ({ amountKobo: a.amountKobo, reason: a.reason })),
      carriedKobo: prev?.items.find((x) => x.employeeId === it.employeeId)?.carryKobo ?? 0,
    }, rates);
    const net = payAfterTax(l.statutory, l.tax) - p.applied;
    return { it, l, p, net, days: { late: t?.LATE ?? 0, absent: t?.ABSENT ?? 0, schoolDays }, adjustments: mine.map((a) => ({ kind: a.kind, amountKobo: a.amountKobo, reason: a.reason })) };
  });
}

export async function calcDefaults(runId: string, by: Actor) {
  const run = await openRun(runId);
  if (at(run.status) < at("TAX_REVIEWED")) throw new UserError("Mark stage 2 reviewed first.");
  const rows = await computeDefaults(run);
  await db.$transaction(async (tx) => {
    for (const r of rows) {
      await tx.payrollItem.update({ where: { id: r.it.id }, data: {
        penaltiesKobo: r.p.applied, carryKobo: r.p.carryForward, netKobo: r.net,
        lines: { ...r.l, defaults: { ...r.p, days: r.days, adjustments: r.adjustments } } as unknown as Prisma.InputJsonValue,
      } });
    }
    await tx.payrollRun.update({ where: { id: runId }, data: { status: "TAX_REVIEWED", defaultsCalcBy: by.name, defaultsCalcAt: new Date(), defaultsRevBy: null, defaultsRevAt: null, preparerIds: addPreparer(run.preparerIds, by.id) } });
  });
}

// ---------- Mark reviewed (refuses figures that are out of date) ----------

export type Stage = 1 | 2 | 3;

export async function markReviewed(runId: string, stage: Stage, by: Actor) {
  const run = await openRun(runId);
  const need: PayrollStatus = stage === 1 ? "DRAFT" : stage === 2 ? "STATUTORY_REVIEWED" : "TAX_REVIEWED";
  const calcAt = stage === 1 ? run.statutoryCalcAt : stage === 2 ? run.taxCalcAt : run.defaultsCalcAt;
  if (run.status !== need) throw new UserError(stage === 1 ? "Stage 1 is already reviewed." : `Stage ${stage - 1} must be reviewed, and stage ${stage} not yet.`);
  if (!calcAt) throw new UserError(`Press Calculate for stage ${stage} first.`);
  // The inputs may have changed since Calculate (a salary, a penalty, attendance): recompute and compare
  const items = await db.payrollItem.findMany({ where: { runId } });
  if (stage === 1) {
    const fresh = await computeStatutory(run.period, ratesOf(run));
    const changed = fresh.length !== items.length || fresh.some((f) => {
      const it = items.find((x) => x.employeeId === f.e.id);
      return !it || it.grossKobo !== f.s.monthly.gross || it.pensionKobo !== f.s.monthly.pension || it.nhfKobo !== f.s.monthly.nhf || it.nhisKobo !== f.s.monthly.nhis || it.held !== !!f.held;
    });
    if (changed) throw new UserError("Salaries, staff or bank details have changed since you calculated. Press Calculate again.");
  }
  if (stage === 3) {
    const fresh = await computeDefaults(run);
    if (fresh.some((f) => f.it.netKobo !== f.net || f.it.carryKobo !== f.p.carryForward)) throw new UserError("Attendance or penalties have changed since you calculated. Press Calculate again.");
  }
  const next: PayrollStatus = stage === 1 ? "STATUTORY_REVIEWED" : stage === 2 ? "TAX_REVIEWED" : "DEFAULTS_REVIEWED";
  const field = stage === 1 ? { statutoryRevBy: by.name, statutoryRevAt: new Date() } : stage === 2 ? { taxRevBy: by.name, taxRevAt: new Date() } : { defaultsRevBy: by.name, defaultsRevAt: new Date() };
  return db.payrollRun.update({ where: { id: runId }, data: { status: next, ...field, preparerIds: addPreparer(run.preparerIds, by.id) } });
}

// ---------- Inputs that change figures ----------

export async function setStatutoryOverride(employeeId: string, item: keyof Overrides, off: boolean, reason: string) {
  if (off && !reason.trim()) throw new UserError("Say why this is switched off for them.", { reason: "Required" });
  const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
  const o = { ...((e.statutoryOverrides ?? {}) as Overrides) };
  if (off) o[item] = { off: true, reason: reason.trim() }; else delete o[item];
  await db.employee.update({ where: { id: employeeId }, data: { statutoryOverrides: o as Prisma.InputJsonValue } });
  await resetOpenRuns("DRAFT");
  return e;
}

export async function addAdjustment(input: { employeeId: string; period: string; kind: "penalty" | "waiver"; amountNaira: number; reason: string }, by: Actor) {
  if (!(input.amountNaira > 0)) throw new UserError("Enter an amount.", { amount: "Required" });
  if (!input.reason.trim()) throw new UserError("Give the reason.", { reason: "Required" });
  const run = await db.payrollRun.findUnique({ where: { period: input.period } });
  if (run && !OPEN.includes(run.status)) throw new UserError(`Payroll for ${periodLabel(input.period)} is already approved. Enter it for next month.`);
  const a = await db.payrollAdjustment.create({ data: { employeeId: input.employeeId, period: input.period, kind: input.kind, amountKobo: Math.round(input.amountNaira * 100), reason: input.reason.trim(), by: by.name, byId: by.id } });
  await resetOpenRuns("TAX_REVIEWED", [input.period]);
  return a;
}

export async function removeAdjustment(id: string) {
  const a = await db.payrollAdjustment.findUniqueOrThrow({ where: { id } });
  const run = await db.payrollRun.findUnique({ where: { period: a.period } });
  if (run && !OPEN.includes(run.status)) throw new UserError("That month's payroll is already approved.");
  await db.payrollAdjustment.delete({ where: { id } });
  await resetOpenRuns("TAX_REVIEWED", [a.period]);
  return a;
}

// ---------- Totals ----------

export function runTotals(items: { grossKobo: number; pensionKobo: number; nhfKobo: number; nhisKobo: number; taxKobo: number; penaltiesKobo: number; netKobo: number; held: boolean }[]) {
  const sum = (f: (i: (typeof items)[number]) => number) => items.reduce((a, i) => a + f(i), 0);
  const payable = items.filter((i) => !i.held);
  return {
    staff: items.length, held: items.length - payable.length,
    gross: sum((i) => i.grossKobo), statutory: sum((i) => i.pensionKobo + i.nhfKobo + i.nhisKobo), tax: sum((i) => i.taxKobo),
    penalties: sum((i) => i.penaltiesKobo), net: sum((i) => i.netKobo), netPayable: payable.reduce((a, i) => a + i.netKobo, 0),
  };
}
