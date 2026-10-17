// The payroll engine: pure functions, no database. All money is integer kobo (₦1 = 100 kobo).
// Stage 1 statutory deductions → stage 2 PAYE tax → stage 3 penalties, as in the plan.

export type TaxBand = { upToNaira: number | null; ratePct: number }; // upTo = top of the band (annual), null = no top

export type PayrollRates = {
  /** Employee pension, % of annual gross (the brief); the Pension Reform Act base is an open question */
  pensionPct: number;
  /** Employer pension, % (shown on remittance files; not deducted from pay) */
  pensionEmployerPct: number;
  /** NHF, % of basic salary */
  nhfPct: number;
  /** Basic salary as a % of gross (NHF is charged on basic) */
  basicPctOfGross: number;
  /** NHIS / NHIA employee contribution, % of annual gross (set by the school) */
  nhisPct: number;
  /** Rent relief: % of declared annual rent, up to the cap; lowers taxable income only */
  rentReliefPct: number;
  rentReliefCapNaira: number;
  taxBands: TaxBand[];
  /** Penalties (stage 3) */
  latePenaltyNaira: number;
  /** "dayPay" = monthly gross ÷ school days that month; or a fixed amount per day */
  absenceRule: "dayPay" | "fixed";
  absencePenaltyNaira: number;
  /** Largest share of the month's pay (after tax) that penalties may take; the rest carries to next month */
  maxPenaltyPct: number;
};

/** Nigeria Tax Act 2025 bands (in force from January 2026) */
export const NTA_2025_BANDS: TaxBand[] = [
  { upToNaira: 800_000, ratePct: 0 }, { upToNaira: 3_000_000, ratePct: 15 }, { upToNaira: 12_000_000, ratePct: 18 },
  { upToNaira: 25_000_000, ratePct: 21 }, { upToNaira: 50_000_000, ratePct: 23 }, { upToNaira: null, ratePct: 25 },
];

export const DEFAULT_RATES: PayrollRates = {
  pensionPct: 8, pensionEmployerPct: 10, nhfPct: 2.5, basicPctOfGross: 100, nhisPct: 0, rentReliefPct: 20, rentReliefCapNaira: 500_000,
  taxBands: NTA_2025_BANDS, latePenaltyNaira: 1_000, absenceRule: "dayPay", absencePenaltyNaira: 0, maxPenaltyPct: 100,
};

const pct = (kobo: number, p: number) => Math.round((kobo * p) / 100);

export type Overrides = Partial<Record<"pension" | "nhf" | "nhis" | "rent", { off: boolean; reason: string }>>;

export type Statutory = {
  annualGross: number; pension: number; nhf: number; nhis: number; rentRelief: number; taxable: number;
  monthly: { gross: number; pension: number; nhf: number; nhis: number };
  off: string[];
};

/** Stage 1: from the monthly gross, the year's statutory deductions and taxable income. Items can be switched off per person. */
export function statutory(monthlyGrossKobo: number, annualRentNaira: number, r: PayrollRates, o: Overrides = {}): Statutory {
  const annualGross = monthlyGrossKobo * 12;
  const on = (k: keyof Overrides) => !o[k]?.off;
  const pension = on("pension") ? pct(annualGross, r.pensionPct) : 0;
  const nhf = on("nhf") ? pct(pct(annualGross, r.basicPctOfGross), r.nhfPct) : 0;
  const nhis = on("nhis") ? pct(annualGross, r.nhisPct) : 0;
  const rentRelief = on("rent") ? Math.min(pct(annualRentNaira * 100, r.rentReliefPct), r.rentReliefCapNaira * 100) : 0;
  const taxable = Math.max(0, annualGross - pension - nhf - nhis - rentRelief);
  return {
    annualGross, pension, nhf, nhis, rentRelief, taxable,
    monthly: { gross: monthlyGrossKobo, pension: Math.round(pension / 12), nhf: Math.round(nhf / 12), nhis: Math.round(nhis / 12) },
    off: (Object.keys(o) as (keyof Overrides)[]).filter((k) => o[k]?.off),
  };
}

export type TaxResult = { annual: number; monthly: number; bands: { fromNaira: number; toNaira: number | null; ratePct: number; taxableKobo: number; taxKobo: number }[] };

/** Stage 2: PAYE on annual taxable income, band by band; monthly = annual ÷ 12. */
export function tax(taxableAnnualKobo: number, bands: TaxBand[]): TaxResult {
  let lower = 0, annual = 0;
  const lines: TaxResult["bands"] = [];
  for (const b of bands) {
    const top = b.upToNaira === null ? Infinity : b.upToNaira * 100;
    const inBand = Math.max(0, Math.min(taxableAnnualKobo, top) - lower);
    const t = pct(inBand, b.ratePct);
    if (inBand > 0) lines.push({ fromNaira: lower / 100, toNaira: b.upToNaira, ratePct: b.ratePct, taxableKobo: inBand, taxKobo: t });
    annual += t;
    if (taxableAnnualKobo <= top) break;
    lower = top;
  }
  return { annual, monthly: Math.round(annual / 12), bands: lines };
}

export type PenaltyInput = {
  lateDays: number; absentDays: number; schoolDays: number;
  /** HR's other penalties this month, kobo */
  manual: { amountKobo: number; reason: string }[];
  /** Waivers this month, kobo (reduce penalties, never below zero) */
  waivers: { amountKobo: number; reason: string }[];
  /** Penalties carried over from last month, kobo */
  carriedKobo: number;
};

export type PenaltyResult = { late: number; absence: number; manual: number; waived: number; carried: number; total: number; applied: number; carryForward: number };

/** Stage 3: penalties come out of pay after tax, up to the allowed share; the rest carries to next month. */
export function penalties(monthlyGrossKobo: number, payAfterTaxKobo: number, p: PenaltyInput, r: PayrollRates): PenaltyResult {
  const late = p.lateDays * r.latePenaltyNaira * 100;
  const perAbsentDay = r.absenceRule === "dayPay" ? (p.schoolDays > 0 ? Math.round(monthlyGrossKobo / p.schoolDays) : 0) : r.absencePenaltyNaira * 100;
  const absence = p.absentDays * perAbsentDay;
  const manual = p.manual.reduce((a, m) => a + m.amountKobo, 0);
  const before = late + absence + manual + p.carriedKobo;
  const waived = Math.min(before, p.waivers.reduce((a, w) => a + w.amountKobo, 0));
  const total = before - waived;
  const cap = Math.max(0, pct(Math.max(0, payAfterTaxKobo), r.maxPenaltyPct));
  const applied = Math.min(total, cap);
  return { late, absence, manual, waived, carried: p.carriedKobo, total, applied, carryForward: total - applied };
}

/** Pay left after stages 1 and 2 */
export const payAfterTax = (s: Statutory, t: TaxResult) => s.monthly.gross - s.monthly.pension - s.monthly.nhf - s.monthly.nhis - t.monthly;

/** School days in a month ("YYYY-MM") from the school's working days (1 = Mon … 7 = Sun) less holidays */
export function schoolDaysIn(month: string, workDays: number[], holidays: string[] = []) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    const day = `${month}-${String(d).padStart(2, "0")}`;
    const wd = ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
    if (workDays.includes(wd) && !holidays.includes(day)) n++;
  }
  return n;
}
