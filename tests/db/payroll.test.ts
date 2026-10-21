// Runs against the throwaway test database: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { registerStaff, reviewBank, setBankDetails } from "../../src/modules/hr/service";
import { dayValue, saveAttendanceSettings } from "../../src/modules/attendance/service";
import {
  addAdjustment, calcDefaults, calcStatutory, calcTax, markReviewed, resetOpenRuns, runByPeriod, runTotals, savePayrollRates, setStatutoryOverride, startRun,
} from "../../src/modules/payroll/service";
import { DEFAULT_RATES } from "../../src/modules/payroll/engine";

const RUN = Date.now().toString(36);
const PERIOD = "2026-09";
const bursar = { id: "bursar-test", name: "Bursar Test" };
let hrId = "";
let a = "", b = "";

before(async () => {
  await db.salaryPayment.deleteMany(); await db.payrollItem.deleteMany(); await db.payrollRun.deleteMany(); await db.payrollAdjustment.deleteMany();
  await db.attendance.deleteMany(); await db.captureToken.deleteMany(); await db.leaveRequest.deleteMany(); await db.holiday.deleteMany();
  await db.employeeDocument.deleteMany(); await db.employee.deleteMany();
  await saveAttendanceSettings({ workDays: [1, 2, 3, 4, 5] });
  await savePayrollRates({ ...DEFAULT_RATES, nhfPct: 0, nhisPct: 0, latePenaltyNaira: 1_000 }); // the plan's worked example: pension only
  hrId = (await db.user.findFirstOrThrow({ where: { email: "office@example.com" } })).id;
  const mk = async (n: number, gross: number) => (await registerStaff({
    firstName: "Pay", lastName: `Roll${n}`, email: `pay${n}.${RUN}@example.com`, section: "school-a", branch: "school-a", position: "Teacher", isTeacher: true,
    hireDate: new Date("2026-01-05T00:00:00Z"), employmentType: "FULL_TIME", monthlyGrossKobo: gross * 100, annualRentNaira: 0,
  })).employee;
  const ea = await mk(1, 100_000), eb = await mk(2, 500_000);
  a = ea.id; b = eb.id;
  await setBankDetails(a, { bankCode: "058", bankName: "GTBank", accountNumber: "0123456789" });
  await reviewBank(a, true, undefined, hrId);
  // Two late days in September for the first person
  for (const d of ["2026-09-07", "2026-09-08"]) await db.attendance.create({ data: { employeeId: a, date: dayValue(d), status: "LATE", clockInAt: new Date(`${d}T08:10:00+01:00`) } });
});

test("a run moves through the three stages in order, with the worked example's figures", async () => {
  const run = await startRun(PERIOD);
  await assert.rejects(startRun(PERIOD), /already been started/);
  await assert.rejects(startRun("2099-01"), /future/);
  await assert.rejects(calcTax(run.id, bursar), /stage 1 reviewed/);
  await assert.rejects(markReviewed(run.id, 1, bursar), /Calculate/);

  await calcStatutory(run.id, bursar);
  let r = (await runByPeriod(PERIOD))!;
  const ia = r.items.find((i) => i.employeeId === a)!, ib = r.items.find((i) => i.employeeId === b)!;
  assert.equal(ia.pensionKobo, 8_000_00);
  assert.equal(ia.held, false);
  assert.equal(ib.held, true, "no verified bank: held");
  await markReviewed(run.id, 1, bursar);
  await assert.rejects(markReviewed(run.id, 1, bursar), /already reviewed/);

  await calcTax(run.id, bursar);
  r = (await runByPeriod(PERIOD))!;
  assert.equal(r.items.find((i) => i.employeeId === a)!.taxKobo, 3_800_00);
  assert.equal(r.items.find((i) => i.employeeId === b)!.taxKobo, 65_300_00, "the plan's second check");
  await markReviewed(run.id, 2, bursar);

  await calcDefaults(run.id, bursar);
  r = (await runByPeriod(PERIOD))!;
  const fa = r.items.find((i) => i.employeeId === a)!;
  assert.equal(fa.penaltiesKobo, 2_000_00);
  assert.equal(fa.netKobo, 86_200_00, "₦88,200 less two late days");
  const reviewed = await markReviewed(run.id, 3, bursar);
  assert.equal(reviewed.status, "DEFAULTS_REVIEWED");
  assert.deepEqual(reviewed.preparerIds, [bursar.id]);
  const t = runTotals(r.items);
  assert.equal(t.held, 1);
  assert.equal(t.netPayable, 86_200_00, "held staff aren't in the total to pay");
});

test("changed inputs: stale figures can't be marked reviewed, and salary or switch changes send runs back", async () => {
  await resetOpenRuns("DRAFT");
  const run = (await runByPeriod(PERIOD))!;
  assert.equal(run.status, "DRAFT");
  await calcStatutory(run.id, bursar);
  await db.employee.update({ where: { id: a }, data: { monthlyGrossKobo: 110_000_00 } });
  await assert.rejects(markReviewed(run.id, 1, bursar), /changed since you calculated/);
  await calcStatutory(run.id, bursar);
  await markReviewed(run.id, 1, bursar);
  await setStatutoryOverride(a, "pension", true, "On probation");
  assert.equal((await runByPeriod(PERIOD))!.status, "DRAFT", "a switched-off item sends the run back to stage 1");
  await calcStatutory(run.id, bursar);
  assert.equal((await runByPeriod(PERIOD))!.items.find((i) => i.employeeId === a)!.pensionKobo, 0);
  await assert.rejects(setStatutoryOverride(a, "nhf", true, "  "), /Say why/);
  await setStatutoryOverride(a, "pension", false, "");
  await db.employee.update({ where: { id: a }, data: { monthlyGrossKobo: 100_000_00 } });
});

test("penalties and waivers: new entries reset stage 3; stale attendance is caught; penalties beyond pay carry over", async () => {
  const run = (await runByPeriod(PERIOD))!;
  await calcStatutory(run.id, bursar); await markReviewed(run.id, 1, bursar);
  await calcTax(run.id, bursar); await markReviewed(run.id, 2, bursar);
  await calcDefaults(run.id, bursar);
  // Late day added after calculating stage 3
  await db.attendance.create({ data: { employeeId: a, date: dayValue("2026-09-09"), status: "LATE", clockInAt: new Date("2026-09-09T08:20:00+01:00") } });
  await assert.rejects(markReviewed(run.id, 3, bursar), /changed since you calculated/);
  await addAdjustment({ employeeId: a, period: PERIOD, kind: "waiver", amountNaira: 1_000, reason: "Traffic jam, Sept 9" }, bursar);
  await addAdjustment({ employeeId: a, period: PERIOD, kind: "penalty", amountNaira: 200_000, reason: "Damaged projector" }, bursar);
  assert.equal((await runByPeriod(PERIOD))!.status, "TAX_REVIEWED");
  await calcDefaults(run.id, bursar);
  const it = (await runByPeriod(PERIOD))!.items.find((i) => i.employeeId === a)!;
  // 3 late (₦3,000) − ₦1,000 waived + ₦200,000 = ₦202,000; only ₦88,200 of pay is available
  assert.equal(it.penaltiesKobo, 88_200_00);
  assert.equal(it.netKobo, 0);
  assert.equal(it.carryKobo, (202_000 - 88_200) * 100, "the rest carries to next month");
  await assert.rejects(addAdjustment({ employeeId: a, period: PERIOD, kind: "penalty", amountNaira: 0, reason: "x" }, bursar), /amount/);
});

test("approval: never by a preparer; a backup first; send back; pay with the retyped total; no double payment", async () => {
  const { approveRun, sendBack, payRun, applyTransferResult, lockFinishedRuns } = await import("../../src/modules/payroll/pay");
  await db.payrollAdjustment.deleteMany({ where: { period: PERIOD } });
  await db.attendance.deleteMany({ where: { employeeId: a, date: dayValue("2026-09-09") } });
  const run = (await runByPeriod(PERIOD))!;
  await resetOpenRuns("DRAFT");
  await calcStatutory(run.id, bursar); await markReviewed(run.id, 1, bursar);
  await calcTax(run.id, bursar); await markReviewed(run.id, 2, bursar);
  await calcDefaults(run.id, bursar); await markReviewed(run.id, 3, bursar);

  const proprietor = { id: "proprietor-test", name: "Proprietor Test" };
  await assert.rejects(approveRun(run.id, bursar), /can't approve/);
  await assert.rejects(payRun(run.id, 86_200), /Approve the run/);
  const backups = await db.backup.count();
  const approved = await approveRun(run.id, proprietor);
  assert.equal(approved.status, "APPROVED");
  assert.equal(await db.backup.count(), backups + 1, "an encrypted backup was taken before approving");

  await sendBack(run.id, "Recheck September attendance", proprietor);
  assert.equal((await runByPeriod(PERIOD))!.status, "DRAFT");
  await calcStatutory(run.id, bursar); await markReviewed(run.id, 1, bursar);
  await calcTax(run.id, bursar); await markReviewed(run.id, 2, bursar);
  await calcDefaults(run.id, bursar); await markReviewed(run.id, 3, bursar);
  await approveRun(run.id, proprietor);

  await assert.rejects(payRun(run.id, 86_000), /doesn't match/);
  const paid = await payRun(run.id, 86_200);
  assert.equal(paid.mode, "mock", "no Paystack key in tests: transfers are simulated");
  assert.equal(paid.sent, 1);
  let r = (await runByPeriod(PERIOD))!;
  assert.equal(r.status, "PAID");
  await assert.rejects(payRun(run.id, 86_200), /has been paid/);
  const pay = await db.salaryPayment.findFirstOrThrow({ where: { item: { runId: run.id } } });
  assert.match(pay.reference, /^nzs_sal_202609_/);
  // The database refuses a second live payment for the same payslip
  await assert.rejects(db.salaryPayment.create({ data: { itemId: pay.itemId, attempt: 9, reference: "dup-test", amountKobo: 1, live: false } }));
  // A reversal makes it payable again, as a new attempt
  await applyTransferResult(pay.reference, "REVERSED", "Account closed");
  await payRun(run.id, 86_200);
  const tries = await db.salaryPayment.findMany({ where: { itemId: pay.itemId }, orderBy: { attempt: "asc" } });
  assert.deepEqual(tries.map((t) => [t.attempt, t.status]), [[1, "REVERSED"], [2, "SUCCESS"]]);
  // After the month ends, paid runs lock
  assert.equal(await lockFinishedRuns(new Date("2026-10-02T00:00:00Z")), 1);
  r = (await runByPeriod(PERIOD))!;
  assert.equal(r.status, "LOCKED");
  await assert.rejects(addAdjustment({ employeeId: a, period: PERIOD, kind: "penalty", amountNaira: 100, reason: "late entry" }, bursar), /already approved/);
});

test("payslips and remittance files come from the approved run", async () => {
  const { payslipPdf, remittanceXlsx } = await import("../../src/modules/payroll/payslip");
  const run = (await runByPeriod(PERIOD))!;
  const item = run.items.find((i) => i.employeeId === a)!;
  const slip = await payslipPdf(item.id);
  assert.equal(slip.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.match(slip.name, /^payslip-2026-09-NS-\d{3}\.pdf$/);
  for (const k of ["pension", "nhf", "nhis", "paye"] as const) {
    const x = await remittanceXlsx(PERIOD, k);
    assert.equal(x.bytes.subarray(0, 2).toString(), "PK", `${k} is an Excel file`);
  }
});
