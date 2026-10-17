import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RATES, NTA_2025_BANDS, payAfterTax, penalties, schoolDaysIn, statutory, tax } from "../src/modules/payroll/engine";

const N = (naira: number) => naira * 100; // kobo
const onlyPension = { ...DEFAULT_RATES, nhfPct: 0, nhisPct: 0 };

test("worked example: ₦100,000 a month, pension only, two late days at ₦1,000", () => {
  const s = statutory(N(100_000), 0, onlyPension);
  assert.equal(s.annualGross, N(1_200_000));
  assert.equal(s.pension, N(96_000));
  assert.equal(s.taxable, N(1_104_000));
  assert.equal(s.monthly.pension, N(8_000));
  const t = tax(s.taxable, NTA_2025_BANDS);
  assert.equal(t.annual, N(45_600));
  assert.equal(t.monthly, N(3_800));
  const after = payAfterTax(s, t);
  assert.equal(after, N(88_200));
  const p = penalties(N(100_000), after, { lateDays: 2, absentDays: 0, schoolDays: 22, manual: [], waivers: [], carriedKobo: 0 }, onlyPension);
  assert.equal(p.applied, N(2_000));
  assert.equal(after - p.applied, N(86_200));
});

test("second check: ₦500,000 a month gives ₦65,300 tax a month", () => {
  const s = statutory(N(500_000), 0, onlyPension);
  assert.equal(s.taxable, N(5_520_000));
  const t = tax(s.taxable, NTA_2025_BANDS);
  assert.equal(t.annual, N(783_600));
  assert.equal(t.monthly, N(65_300));
});

test("every band edge, and ₦1 either side", () => {
  const cases: [number, number][] = [
    [800_000, 0], [800_001, 0.15], [3_000_000, 330_000], [3_000_001, 330_000.18], [12_000_000, 1_950_000], [12_000_001, 1_950_000.21],
    [25_000_000, 4_680_000], [25_000_001, 4_680_000.23], [50_000_000, 10_430_000], [50_000_001, 10_430_000.25], [799_999, 0],
  ];
  for (const [income, expected] of cases) assert.equal(tax(N(income), NTA_2025_BANDS).annual, Math.round(expected * 100), `₦${income}`);
  assert.equal(tax(0, NTA_2025_BANDS).annual, 0);
});

test("NHF on basic, NHIS, rent relief capped; items can be switched off for one person", () => {
  const r = { ...DEFAULT_RATES, basicPctOfGross: 50, nhisPct: 1.75 };
  const s = statutory(N(200_000), 3_000_000, r);
  assert.equal(s.pension, N(192_000));
  assert.equal(s.nhf, N(30_000), "2.5% of basic (half of ₦2.4m)");
  assert.equal(s.nhis, N(42_000));
  assert.equal(s.rentRelief, N(500_000), "20% of ₦3m is ₦600k, capped at ₦500k");
  assert.equal(s.taxable, N(2_400_000 - 192_000 - 30_000 - 42_000 - 500_000));
  const off = statutory(N(200_000), 3_000_000, r, { pension: { off: true, reason: "On probation, no RSA PIN yet" } });
  assert.equal(off.pension, 0);
  assert.deepEqual(off.off, ["pension"]);
});

test("zero salary, and penalties larger than pay carry to next month", () => {
  const s = statutory(0, 0, DEFAULT_RATES);
  assert.equal(tax(s.taxable, NTA_2025_BANDS).annual, 0);
  const p = penalties(N(30_000), N(20_000), { lateDays: 0, absentDays: 0, schoolDays: 20, manual: [{ amountKobo: N(25_000), reason: "Damage" }], waivers: [], carriedKobo: N(1_000) }, DEFAULT_RATES);
  assert.equal(p.total, N(26_000));
  assert.equal(p.applied, N(20_000));
  assert.equal(p.carryForward, N(6_000));
  const capped = penalties(N(30_000), N(20_000), { lateDays: 10, absentDays: 0, schoolDays: 20, manual: [], waivers: [], carriedKobo: 0 }, { ...DEFAULT_RATES, maxPenaltyPct: 25 });
  assert.equal(capped.applied, N(5_000), "at most a quarter of pay");
});

test("absence costs a day's pay by default; waivers reduce penalties but never below zero", () => {
  const p = penalties(N(110_000), N(100_000), { lateDays: 1, absentDays: 2, schoolDays: 22, manual: [], waivers: [{ amountKobo: N(1_000), reason: "Traffic" }], carriedKobo: 0 }, DEFAULT_RATES);
  assert.equal(p.absence, N(10_000));
  assert.equal(p.waived, N(1_000));
  assert.equal(p.applied, N(10_000));
  const big = penalties(N(110_000), N(100_000), { lateDays: 1, absentDays: 0, schoolDays: 22, manual: [], waivers: [{ amountKobo: N(9_000), reason: "x" }], carriedKobo: 0 }, DEFAULT_RATES);
  assert.equal(big.applied, 0);
});

test("school days in a month skip weekends and holidays", () => {
  assert.equal(schoolDaysIn("2026-10", [1, 2, 3, 4, 5]), 22);
  assert.equal(schoolDaysIn("2026-10", [1, 2, 3, 4, 5], ["2026-10-01"]), 21);
});
