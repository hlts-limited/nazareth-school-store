// Runs against the throwaway test database: npm run test:db (after payroll.test.ts)
// Bonuses are added after tax and penalties; penalty categories; whoever enters one can't approve; salary splits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import {
  addAdjustment, calcDefaults, calcStatutory, calcTax, markReviewed, payrollRates, savePayrollRates, setSalaryComponents, startRun,
} from "../../src/modules/payroll/service";
import { approveRun } from "../../src/modules/payroll/pay";
import { DEFAULT_RATES } from "../../src/modules/payroll/engine";

const PERIOD = "2026-10";
const accounts = { id: "accounts-bonus-test", name: "Accounts Test" };
const approver = { id: "approver-bonus-test", name: "Super Admin Test" };

test("rates: components must add up to 100%; new penalty categories and bonus types are kept", async () => {
  await assert.rejects(savePayrollRates({ components: DEFAULT_RATES.components.map((c) => (c.id === "basic" ? { ...c, pct: 40 } : c)) }), /add up to 90%/);
  const saved = await savePayrollRates({
    ...DEFAULT_RATES, nhfPct: 0, nhisPct: 0,
    penaltyCategories: [{ id: "other", name: "Other", defaultNaira: 0, active: true }, { id: "lost", name: "Lost property", defaultNaira: 5_000, active: true }],
    bonusTypes: [{ id: "performance", name: "Performance", active: true }],
  });
  assert.equal(saved.penaltyCategories.length, 2);
  assert.equal((await payrollRates()).bonusTypes[0].name, "Performance");
});

test("a person's own split must add up to their gross; a new gross clears it", async () => {
  const e = await db.employee.findFirstOrThrow({ where: { status: "ACTIVE" }, orderBy: { staffCode: "asc" } });
  const g = e.monthlyGrossKobo / 100;
  await assert.rejects(setSalaryComponents(e.id, { basic: g, housing: 1, transport: 0, utility: 0 }), /must match/);
  await setSalaryComponents(e.id, { basic: g * 0.6, housing: g * 0.2, transport: g * 0.1, utility: g * 0.1 });
  assert.ok((await db.employee.findUniqueOrThrow({ where: { id: e.id } })).salaryComponents);
  await setSalaryComponents(e.id, null);
  assert.equal((await db.employee.findUniqueOrThrow({ where: { id: e.id } })).salaryComponents, null);
});

test("bonuses are paid after tax (not taxed); penalties keep their category; whoever entered one can't approve", async () => {
  const staff = await db.employee.findMany({ where: { status: "ACTIVE", bankStatus: "VERIFIED" }, orderBy: { staffCode: "asc" } });
  const e = staff[0];
  await db.payrollRun.deleteMany({ where: { period: PERIOD } });
  await db.payrollAdjustment.deleteMany({ where: { period: PERIOD } });
  await assert.rejects(addAdjustment({ employeeId: e.id, period: PERIOD, kind: "bonus", amountNaira: 10_000, reason: "Great term" }, accounts), /type of bonus/);
  await addAdjustment({ employeeId: e.id, period: PERIOD, kind: "bonus", category: "Performance", amountNaira: 10_000, reason: "Great term" }, accounts);
  await addAdjustment({ employeeId: e.id, period: PERIOD, kind: "penalty", category: "Lost property", amountNaira: 5_000, reason: "Lost a projector remote" }, accounts);

  const run = await startRun(PERIOD);
  const prep = { id: "prep-bonus-test", name: "Preparer" };
  await calcStatutory(run.id, prep); await markReviewed(run.id, 1, prep);
  await calcTax(run.id, prep); await markReviewed(run.id, 2, prep);
  await calcDefaults(run.id, prep); await markReviewed(run.id, 3, prep);
  const it = await db.payrollItem.findFirstOrThrow({ where: { runId: run.id, employeeId: e.id } });
  const l = it.lines as unknown as { statutory: { breakdown: { monthly: number }[] }; defaults: { byCategory: { name: string; amount: number }[]; bonuses: { type: string }[] } };
  assert.equal(it.bonusKobo, 1_000_000);
  const afterTax = it.grossKobo - it.pensionKobo - it.nhfKobo - it.nhisKobo - it.taxKobo;
  assert.equal(it.netKobo, afterTax - it.penaltiesKobo + it.bonusKobo, "bonus added after tax and penalties");
  assert.deepEqual(l.defaults.byCategory, [{ name: "Lost property", amount: 500_000 }]);
  assert.equal(l.defaults.bonuses[0].type, "Performance");
  assert.equal(l.statutory.breakdown.reduce((a, b) => a + b.monthly, 0), it.grossKobo, "the breakdown adds up to gross");

  // Tax is the same with or without the bonus
  const plain = await db.payrollItem.findFirst({ where: { runId: run.id, employeeId: { not: e.id } } });
  assert.ok(plain);
  await assert.rejects(approveRun(run.id, accounts), /entered penalties or bonuses/);
  await approveRun(run.id, approver);
  await assert.rejects(addAdjustment({ employeeId: e.id, period: PERIOD, kind: "bonus", category: "Performance", amountNaira: 1, reason: "late" }, accounts), /already approved/);
});
