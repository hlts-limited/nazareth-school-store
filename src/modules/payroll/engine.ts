// The payroll engine: pure functions, no database. All money is integer kobo (₦1 = 100 kobo).
// Stage 1 statutory deductions → stage 2 PAYE tax → stage 3 penalties, as in the plan.

export type TaxBand = { upToNaira: number | null; ratePct: number }; // upTo = top of the band (annual), null = no top

/** A part of gross pay (Basic, Housing…). `pct` is its share of gross by default; ticks say what pension and NHF are worked out on. */
export type PayComponent = { id: string; name: string; pct: number; pension: boolean; nhf: boolean; active: boolean };
/** A kind of penalty with a default amount (₦) that can be changed when it's entered */
export type PenaltyCategory = { id: string; name: string; defaultNaira: number; active: boolean };
/** A kind of bonus (paid after tax, so not taxed) */
export type BonusType = { id: string; name: string; active: boolean };

export type PayrollRates = {
  /** Employee pension, % of annual gross (the brief); the Pension Reform Act base is an open question */
  pensionPct: number;
  /** Employer pension, % (shown on remittance files; not deducted from pay). Fixed: not on the rates form */
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
  /** The parts gross pay is split into; shares add up to 100% */
  components: PayComponent[];
  /**
   * What pension and NHF are worked out on. "gross": pension on the whole gross and NHF on basic (basicPctOfGross),
   * as the school has done so far. "components": on the parts ticked for each (the Pension Reform Act uses basic + housing + transport).
   */
  statutoryBase: "gross" | "components";
  penaltyCategories: PenaltyCategory[];
  bonusTypes: BonusType[];
};

/** Nigeria Tax Act 2025 bands (in force from January 2026) */
export const NTA_2025_BANDS: TaxBand[] = [
  { upToNaira: 800_000, ratePct: 0 }, { upToNaira: 3_000_000, ratePct: 15 }, { upToNaira: 12_000_000, ratePct: 18 },
  { upToNaira: 25_000_000, ratePct: 21 }, { upToNaira: 50_000_000, ratePct: 23 }, { upToNaira: null, ratePct: 25 },
];

export const DEFAULT_COMPONENTS: PayComponent[] = [
  { id: "basic", name: "Basic", pct: 50, pension: true, nhf: true, active: true },
  { id: "housing", name: "Housing", pct: 25, pension: true, nhf: false, active: true },
  { id: "transport", name: "Transport", pct: 15, pension: true, nhf: false, active: true },
  { id: "utility", name: "Utility", pct: 10, pension: false, nhf: false, active: true },
];

export const DEFAULT_RATES: PayrollRates = {
  pensionPct: 8, pensionEmployerPct: 10, nhfPct: 2.5, basicPctOfGross: 100, nhisPct: 0, rentReliefPct: 20, rentReliefCapNaira: 500_000,
  taxBands: NTA_2025_BANDS, latePenaltyNaira: 1_000, absenceRule: "dayPay", absencePenaltyNaira: 0, maxPenaltyPct: 100,
  components: DEFAULT_COMPONENTS, statutoryBase: "gross",
  penaltyCategories: [{ id: "other", name: "Other", defaultNaira: 0, active: true }],
  bonusTypes: [
    { id: "performance", name: "Performance", active: true }, { id: "overtime", name: "Overtime", active: true },
    { id: "thirteenth", name: "13th month", active: true }, { id: "other", name: "Other", active: true },
  ],
};

/** A staff member's split of gross into components: their own amounts if set (and still adding up), otherwise the default shares */
export function splitGross(monthlyGrossKobo: number, components: PayComponent[], own?: Record<string, number> | null) {
  const list = components.filter((c) => c.active);
  if (own && list.length && list.every((c) => typeof own[c.id] === "number") && list.reduce((a, c) => a + own[c.id], 0) === monthlyGrossKobo) {
    return list.map((c) => ({ id: c.id, name: c.name, monthly: own[c.id], custom: true }));
  }
  const parts = list.map((c) => ({ id: c.id, name: c.name, monthly: Math.floor((monthlyGrossKobo * c.pct) / 100), custom: false }));
  // Whatever rounding leaves goes to the first part, so the parts add up to gross exactly
  if (parts.length) parts[0].monthly += monthlyGrossKobo - parts.reduce((a, x) => a + x.monthly, 0);
  return parts;
}

const pct = (kobo: number, p: number) => Math.round((kobo * p) / 100);

export type Overrides = Partial<Record<"pension" | "nhf" | "nhis" | "rent", { off: boolean; reason: string }>>;

export type Statutory = {
  annualGross: number; pension: number; nhf: number; nhis: number; rentRelief: number; taxable: number;
  monthly: { gross: number; pension: number; nhf: number; nhis: number };
  off: string[];
  /** How gross is made up, and what pension and NHF were worked out on (yearly kobo) */
  breakdown?: { id: string; name: string; monthly: number; custom: boolean }[];
  base?: { mode: "gross" | "components"; pension: number; nhf: number };
};

/** Stage 1: from the monthly gross, the year's statutory deductions and taxable income. Items can be switched off per person. */
export function statutory(monthlyGrossKobo: number, annualRentNaira: number, r: PayrollRates, o: Overrides = {}, own?: Record<string, number> | null): Statutory {
  const annualGross = monthlyGrossKobo * 12;
  const on = (k: keyof Overrides) => !o[k]?.off;
  const comps = r.components?.length ? r.components : DEFAULT_COMPONENTS;
  const breakdown = splitGross(monthlyGrossKobo, comps, own);
  const byComponents = r.statutoryBase === "components";
  const yearly = (tick: "pension" | "nhf") => breakdown.filter((b) => comps.find((c) => c.id === b.id)?.[tick]).reduce((a, b) => a + b.monthly, 0) * 12;
  const pensionBase = byComponents ? yearly("pension") : annualGross;
  const nhfBase = byComponents ? yearly("nhf") : pct(annualGross, r.basicPctOfGross);
  const pension = on("pension") ? pct(pensionBase, r.pensionPct) : 0;
  const nhf = on("nhf") ? pct(nhfBase, r.nhfPct) : 0;
  const nhis = on("nhis") ? pct(annualGross, r.nhisPct) : 0;
  const rentRelief = on("rent") ? Math.min(pct(annualRentNaira * 100, r.rentReliefPct), r.rentReliefCapNaira * 100) : 0;
  const taxable = Math.max(0, annualGross - pension - nhf - nhis - rentRelief);
  return {
    annualGross, pension, nhf, nhis, rentRelief, taxable,
    monthly: { gross: monthlyGrossKobo, pension: Math.round(pension / 12), nhf: Math.round(nhf / 12), nhis: Math.round(nhis / 12) },
    off: (Object.keys(o) as (keyof Overrides)[]).filter((k) => o[k]?.off),
    breakdown, base: { mode: byComponents ? "components" : "gross", pension: pensionBase, nhf: nhfBase },
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
  /** Other penalties entered this month, kobo, with their category */
  manual: { amountKobo: number; reason: string; category?: string }[];
  /** Waivers this month, kobo (reduce penalties, never below zero) */
  waivers: { amountKobo: number; reason: string }[];
  /** Penalties carried over from last month, kobo */
  carriedKobo: number;
};

export type PenaltyResult = {
  late: number; absence: number; manual: number; waived: number; carried: number; total: number; applied: number; carryForward: number;
  /** Other penalties added up by category name (for the run page and payslip) */
  byCategory?: { name: string; amount: number }[];
};

/** Stage 3: penalties come out of pay after tax, up to the allowed share; the rest carries to next month. */
export function penalties(monthlyGrossKobo: number, payAfterTaxKobo: number, p: PenaltyInput, r: PayrollRates): PenaltyResult {
  const late = p.lateDays * r.latePenaltyNaira * 100;
  const perAbsentDay = r.absenceRule === "dayPay" ? (p.schoolDays > 0 ? Math.round(monthlyGrossKobo / p.schoolDays) : 0) : r.absencePenaltyNaira * 100;
  const absence = p.absentDays * perAbsentDay;
  const manual = p.manual.reduce((a, m) => a + m.amountKobo, 0);
  const cats = new Map<string, number>();
  for (const m of p.manual) cats.set(m.category ?? "Other", (cats.get(m.category ?? "Other") ?? 0) + m.amountKobo);
  const before = late + absence + manual + p.carriedKobo;
  const waived = Math.min(before, p.waivers.reduce((a, w) => a + w.amountKobo, 0));
  const total = before - waived;
  const cap = Math.max(0, pct(Math.max(0, payAfterTaxKobo), r.maxPenaltyPct));
  const applied = Math.min(total, cap);
  return { late, absence, manual, waived, carried: p.carriedKobo, total, applied, carryForward: total - applied, byCategory: [...cats].map(([name, amount]) => ({ name, amount })) };
}

/** Bonuses are paid after tax and penalties, so they're not taxed and penalties can't take them */
export const bonusTotal = (bonuses: { amountKobo: number }[]) => bonuses.reduce((a, b) => a + b.amountKobo, 0);

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
