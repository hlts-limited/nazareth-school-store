"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zText, type ActionResult } from "@/shared/lib/action";
import { db } from "@/shared/lib/db";
import { auditActor, staffFor, verifyTotp, type StaffViewer } from "@/modules/auth";
import { audit } from "@/modules/audit";
import type { BonusType, PayComponent, PenaltyCategory, TaxBand } from "./engine";
import {
  addAdjustment, calcDefaults, calcStatutory, calcTax, markReviewed, payrollRates, periodLabel, removeAdjustment, runTotals, savePayrollRates, setSalaryComponents, setStatutoryOverride, startRun,
  type Stage,
} from "./service";
import { approveRun, payRun, refreshPending, sendBack } from "./pay";

const actor = (v: StaffViewer) => ({ id: v.user.id, name: `${v.user.firstName} ${v.user.lastName}` });
const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const zMoney = (msg: string) => z.preprocess((x) => (typeof x === "string" ? x.replace(/[,\s₦]/g, "") : x), z.coerce.number({ invalid_type_error: msg }).min(0, msg).max(1e10));
/** The rows of an editable list on the rates form: `${prefix}.${key}`, one value per row, in order */
function readRows(form: FormData, prefix: string, keys: string[]) {
  const ids = form.getAll(`${prefix}.id`).map(String);
  const cols = Object.fromEntries(keys.map((k) => [k, form.getAll(`${prefix}.${k}`).map(String)]));
  return ids.map((id, i) => ({ id, ...Object.fromEntries(keys.map((k) => [k, cols[k][i] ?? ""])) }) as Record<string, string> & { id: string });
}
const num = (v: string) => Number(String(v).replace(/[,\s₦%]/g, ""));
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "item";
/** New rows get an id from their name; saved rows keep theirs (past payslips refer to it) */
function ids<T extends { id: string; name: string }>(rows: T[]) {
  const taken = new Set(rows.filter((r) => !r.id.startsWith("new-")).map((r) => r.id));
  return rows.map((r) => {
    if (!r.id.startsWith("new-")) return r;
    let id = slug(r.name), n = 2;
    while (taken.has(id)) id = `${slug(r.name)}-${n++}`;
    taken.add(id);
    return { ...r, id };
  });
}

const zPct = z.preprocess((x) => (typeof x === "string" ? x.replace(/[%\s]/g, "") : x), z.coerce.number({ invalid_type_error: "Enter a percentage" }).min(0).max(100));

export async function startRunAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payroll.run");
    const period = String(form.get("period") ?? "");
    const run = await startRun(period);
    await audit(await auditActor(v), "Started payroll run", "PayrollRun", run.id, { period });
    return ok(`Payroll for ${periodLabel(period)} started. Press Calculate on stage 1.`, { redirect: `/admin/payroll/${period}` });
  });
}

export async function calculateAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payroll.run");
    const runId = String(form.get("runId"));
    const stage = Number(form.get("stage")) as Stage;
    if (stage === 1) await calcStatutory(runId, actor(v));
    else if (stage === 2) await calcTax(runId, actor(v));
    else if (stage === 3) await calcDefaults(runId, actor(v));
    else return fail("Choose a stage.");
    const items = await db.payrollItem.findMany({ where: { runId } });
    const t = runTotals(items);
    await audit(await auditActor(v), `Calculated payroll stage ${stage}`, "PayrollRun", runId, { staff: t.staff, gross: t.gross / 100, statutory: t.statutory / 100, tax: t.tax / 100, penalties: t.penalties / 100, net: t.net / 100 });
    return ok(`Stage ${stage} calculated for ${t.staff} staff. Check the figures, then mark it reviewed.`);
  });
}

export async function markReviewedAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payroll.run");
    const runId = String(form.get("runId"));
    const stage = Number(form.get("stage")) as Stage;
    const run = await markReviewed(runId, stage, actor(v));
    const t = runTotals(await db.payrollItem.findMany({ where: { runId } }));
    await audit(await auditActor(v), `Reviewed payroll stage ${stage}`, "PayrollRun", runId, { period: run.period, net: t.net / 100, gross: t.gross / 100 });
    return ok(stage === 3 ? `Payroll ready for the Super Admin's approval: net pay ${naira(t.netPayable)} for ${t.staff - t.held} staff.` : `Stage ${stage} reviewed. Stage ${stage + 1} is open.`);
  });
}

export async function overrideAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payroll.run");
    const d = parseForm(z.object({ employeeId: zText(100), item: z.enum(["pension", "nhf", "nhis", "rent"]), off: z.string().optional(), reason: z.string().optional() }), form);
    const e = await setStatutoryOverride(d.employeeId, d.item, d.off === "on", d.reason ?? "");
    await audit(await auditActor(v), d.off === "on" ? "Switched off statutory item" : "Switched on statutory item", "Employee", e.id, { staffCode: e.staffCode, item: d.item, reason: d.reason });
    return ok(`${d.item.toUpperCase()} ${d.off === "on" ? "switched off" : "switched back on"}. Open runs go back to stage 1: press Calculate again.`);
  });
}

export async function addAdjustmentAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payroll.penalties");
    const d = parseForm(z.object({
      employeeId: zText(100, "Choose the staff member"), period: z.string().regex(/^\d{4}-\d{2}$/, "Choose the month"), kind: z.enum(["penalty", "waiver", "bonus"]),
      category: z.string().optional(), amount: zMoney("Enter an amount"), reason: zText(200, "Give the reason"),
    }), form);
    const target = await db.employee.findUniqueOrThrow({ where: { id: d.employeeId } });
    if (target.userId === v.user.id) return fail("You can't enter a penalty, waiver or bonus for yourself.");
    const a = await addAdjustment({ employeeId: d.employeeId, period: d.period, kind: d.kind, category: d.category, amountNaira: d.amount, reason: d.reason }, actor(v));
    const word = d.kind === "penalty" ? "Penalty" : d.kind === "bonus" ? "Bonus" : "Waiver";
    await audit(await auditActor(v), `Entered ${word.toLowerCase()}`, "PayrollAdjustment", a.id, { staffCode: target.staffCode, period: d.period, category: a.category, amount: d.amount, reason: d.reason });
    return ok(`${word} saved for ${periodLabel(d.period)}. If that month's payroll is open, stage 3 needs calculating again.`);
  });
}

export async function removeAdjustmentAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payroll.penalties");
    const a = await removeAdjustment(String(form.get("id")));
    await audit(await auditActor(v), `Removed ${a.kind}`, "PayrollAdjustment", a.id, { period: a.period, kind: a.kind, category: a.category, amount: a.amountKobo / 100, reason: a.reason });
    return ok("Removed.");
  });
}

export async function saveRatesAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payroll.run");
    const d = parseForm(z.object({
      pensionPct: zPct, nhfPct: zPct, basicPctOfGross: zPct, nhisPct: zPct, rentReliefPct: zPct, rentReliefCapNaira: zMoney("Enter the cap"),
      latePenaltyNaira: zMoney("Enter the amount per late day"), absenceRule: z.enum(["dayPay", "fixed"]), absencePenaltyNaira: zMoney("Enter the amount per day"), maxPenaltyPct: zPct,
    }), form);
    // Tax bands come as band-top-N / band-rate-N rows; the last has no top
    const tops = form.getAll("bandTop").map(String), ratesIn = form.getAll("bandRate").map(String);
    const bands: TaxBand[] = ratesIn.map((r, i) => ({ upToNaira: i === ratesIn.length - 1 ? null : Number(tops[i]?.replace(/[,\s₦]/g, "")), ratePct: Number(r) }));
    if (bands.some((b, i) => !Number.isFinite(b.ratePct) || b.ratePct < 0 || b.ratePct > 100 || (i < bands.length - 1 && !(Number(b.upToNaira) > 0)))) return fail("Check the tax bands: each needs an upper limit (except the last) and a rate.");
    // Salary components, penalty categories and bonus types (rows added on the form get an id from their name)
    const components: PayComponent[] = ids(readRows(form, "comp", ["name", "pct", "pension", "nhf", "active"]).filter((r) => r.name.trim()).map((r) => ({
      id: r.id, name: r.name.trim(), pct: num(r.pct), pension: r.pension === "1", nhf: r.nhf === "1", active: r.active === "1",
    })));
    if (components.some((c) => !Number.isFinite(c.pct) || c.pct < 0 || c.pct > 100)) return fail("Each component's share must be between 0% and 100%.");
    const penaltyCategories: PenaltyCategory[] = ids(readRows(form, "pen", ["name", "defaultNaira", "active"]).filter((r) => r.name.trim()).map((r) => ({
      id: r.id, name: r.name.trim(), defaultNaira: Math.max(0, num(r.defaultNaira) || 0), active: r.active === "1",
    })));
    const bonusTypes: BonusType[] = ids(readRows(form, "bonus", ["name", "active"]).filter((r) => r.name.trim()).map((r) => ({ id: r.id, name: r.name.trim(), active: r.active === "1" })));
    if (!penaltyCategories.some((c) => c.active)) penaltyCategories.push({ id: "other", name: "Other", defaultNaira: 0, active: true });
    const statutoryBase = form.get("statutoryBase") === "components" ? "components" as const : "gross" as const;
    const before = await payrollRates();
    const saved = await savePayrollRates({ ...d, taxBands: bands, components, penaltyCategories, bonusTypes, statutoryBase });
    await audit(await auditActor(v), "Changed payroll rates", "Setting", "payroll", JSON.parse(JSON.stringify(saved)));
    const switched = before.statutoryBase !== statutoryBase;
    return ok(`Rates saved.${switched ? ` Pension and NHF are now worked out on ${statutoryBase === "components" ? "the ticked components" : "the whole gross"}.` : ""} They apply the next time stage 1 is calculated; runs already calculated keep the rates they used.`);
  });
}

// ---------- Approval and payment (the Super Admin) ----------

/** Approving and paying need a sign-in in the last 15 minutes, or the 2FA code typed now. */
function recentlySignedIn(v: StaffViewer, code: string | null) {
  if (Date.now() - new Date(v.session.createdAt).getTime() < 15 * 60_000) return true;
  return !!code && !!v.user.totpSecret && verifyTotp(code, v.user.totpSecret);
}

export async function approveRunAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payroll.approve");
    if (!recentlySignedIn(v, String(form.get("code") ?? ""))) return fail("Enter the 6-digit code from your authenticator app to confirm it's you.", { code: "Required: you signed in more than 15 minutes ago" });
    const run = await approveRun(String(form.get("runId")), actor(v));
    const t = runTotals(await db.payrollItem.findMany({ where: { runId: run.id } }));
    await audit(await auditActor(v), "Approved payroll", "PayrollRun", run.id, { period: run.period, staff: t.staff, held: t.held, gross: t.gross / 100, statutory: t.statutory / 100, tax: t.tax / 100, penalties: t.penalties / 100, net: t.netPayable / 100 });
    return ok(`${periodLabel(run.period)} payroll approved. A backup was taken first. You can now pay.`);
  });
}

export async function sendBackAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payroll.approve");
    const note = String(form.get("note") ?? "");
    const run = await sendBack(String(form.get("runId")), note, actor(v));
    await audit(await auditActor(v), "Sent payroll back", "PayrollRun", run.id, { period: run.period, note });
    return ok("Sent back to Accounts with your note.");
  });
}

export async function payRunAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("payroll.pay");
    if (!recentlySignedIn(v, String(form.get("code") ?? ""))) return fail("Enter the 6-digit code from your authenticator app to confirm it's you.", { code: "Required: you signed in more than 15 minutes ago" });
    const confirm = Number(String(form.get("confirm") ?? "").replace(/[,\s₦]/g, ""));
    if (!Number.isFinite(confirm) || confirm <= 0) return fail("Type the total to confirm.", { confirm: "Required" });
    const runId = String(form.get("runId"));
    const r = await payRun(runId, confirm);
    const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    await audit(await auditActor(v), "Paid salaries", "PayrollRun", runId, { period: run.period, mode: r.mode, total: r.total / 100, sent: r.sent, failed: r.failed });
    return ok(`${r.sent} salar${r.sent === 1 ? "y" : "ies"} sent (${naira(r.total)})${r.failed ? `; ${r.failed} failed: see the reasons below and retry once fixed` : ""}.${r.mode === "mock" ? " (Simulated: no Paystack key in development.)" : ""}`);
  });
}

export async function refreshPaymentsAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await staffFor("payroll.view");
    const r = await refreshPending(String(form.get("runId")));
    return ok(r.checked ? `Checked ${r.checked} waiting payment${r.checked === 1 ? "" : "s"} with Paystack: ${r.changed} updated.` : "Nothing is waiting for Paystack.");
  });
}

/** A staff member's split of gross into components (or back to the school's default shares) */
export async function saveSalarySplitAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("hr.salary");
    const employeeId = String(form.get("employeeId") ?? "");
    const useDefault = form.get("reset") === "1";
    const rates = await payrollRates();
    const amounts = useDefault ? null : Object.fromEntries(rates.components.filter((c) => c.active).map((c) => [c.id, num(String(form.get(`part.${c.id}`) ?? "0")) || 0]));
    const e = await setSalaryComponents(employeeId, amounts);
    await audit(await auditActor(v), useDefault ? "Reset salary breakdown" : "Changed salary breakdown", "Employee", e.id, { staffCode: e.staffCode, ...(amounts ?? {}) });
    return ok(useDefault ? "Back to the school's default shares." : "Salary breakdown saved. Open payroll runs go back to stage 1.");
  });
}
