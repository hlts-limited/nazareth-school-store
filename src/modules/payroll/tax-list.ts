import ExcelJS from "exceljs";
import { db } from "@/shared/lib/db";
import { SCHOOL } from "@/shared/config/school";
import { periodLabel } from "./service";

/** Runs whose figures are final: approved, paid or locked */
const FINAL = ["APPROVED", "PAID", "LOCKED"] as const;
const naira = (kobo: number) => Math.round(kobo) / 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Taxable = { statutory?: { taxable?: number } };

/** Which runs a download covers: one month ("2026-09") or a whole year ("2026") */
export function taxListScope(q: string) {
  if (/^\d{4}-\d{2}$/.test(q)) return { kind: "month" as const, period: q };
  if (/^\d{4}$/.test(q)) return { kind: "year" as const, year: q };
  return null;
}

/**
 * Every staff member on the approved payroll with the tax (PAYE) deducted from their pay, as Excel.
 * A month: one row per person with gross, deductions, taxable income and tax. A year: one row per person with
 * each month's tax and the year's total (for annual returns). Only approved runs count, so figures are final.
 */
export async function taxListXlsx(scope: NonNullable<ReturnType<typeof taxListScope>>) {
  const runs = await db.payrollRun.findMany({
    where: { status: { in: [...FINAL] }, ...(scope.kind === "month" ? { period: scope.period } : { period: { startsWith: `${scope.year}-` } }) },
    include: { items: { include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } } } },
    orderBy: { period: "asc" },
  });
  const title = scope.kind === "month" ? periodLabel(scope.period) : `January to December ${scope.year}`;
  const wb = new ExcelJS.Workbook();
  wb.creator = SCHOOL.name;
  const ws = wb.addWorksheet(scope.kind === "month" ? `Tax ${scope.period}` : `Tax ${scope.year}`, { views: [{ state: "frozen", ySplit: 3 }] });
  ws.addRow([`${SCHOOL.name}: staff tax (PAYE) deducted, ${title}`]).font = { bold: true, size: 13 };
  ws.addRow([runs.length ? `From ${runs.length} approved payroll run${runs.length === 1 ? "" : "s"} · amounts in naira · downloaded ${new Date().toLocaleDateString("en-GB", { timeZone: "Africa/Lagos" })}` : "No approved payroll run for this period yet."]).font = { color: { argb: "FF756E70" } };

  const style = (row: ExcelJS.Row) => { row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD7262D" } }; }); };
  const money = "#,##0.00";

  if (scope.kind === "month") {
    const head = ["Staff code", "Surname", "First name", "TIN", "Gross pay", "Pension", "NHF", "NHIS", "Annual taxable income", "Tax (PAYE) deducted", "Net pay"];
    style(ws.addRow(head));
    const items = (runs[0]?.items ?? []).sort((a, b) => a.employee.staffCode.localeCompare(b.employee.staffCode));
    for (const i of items) {
      ws.addRow([i.employee.staffCode, i.employee.user.lastName, i.employee.user.firstName, i.employee.tin ?? "", naira(i.grossKobo), naira(i.pensionKobo), naira(i.nhfKobo), naira(i.nhisKobo),
        naira((i.lines as Taxable | null)?.statutory?.taxable ?? 0), naira(i.taxKobo), naira(i.netKobo)]);
    }
    const sum = (f: (x: (typeof items)[number]) => number) => naira(items.reduce((a, x) => a + f(x), 0));
    ws.addRow(["", "", "", "Total", sum((x) => x.grossKobo), sum((x) => x.pensionKobo), sum((x) => x.nhfKobo), sum((x) => x.nhisKobo), "", sum((x) => x.taxKobo), sum((x) => x.netKobo)]).font = { bold: true };
    [5, 6, 7, 8, 9, 10, 11].forEach((c) => (ws.getColumn(c).numFmt = money));
    [11, 18, 18, 16, 14, 12, 12, 12, 20, 18, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  } else {
    // One row per person, a column per month, then the year's totals
    const months = runs.map((r) => r.period);
    style(ws.addRow(["Staff code", "Surname", "First name", "TIN", ...months.map((p) => `Tax ${MONTHS.at(Number(p.slice(5)) - 1)}`), "Total tax (PAYE)", "Total gross pay"]));
    const people = new Map<string, { code: string; last: string; first: string; tin: string; tax: Map<string, number>; gross: number }>();
    for (const r of runs) for (const i of r.items) {
      const p = people.get(i.employeeId) ?? { code: i.employee.staffCode, last: i.employee.user.lastName, first: i.employee.user.firstName, tin: i.employee.tin ?? "", tax: new Map(), gross: 0 };
      p.tax.set(r.period, (p.tax.get(r.period) ?? 0) + i.taxKobo);
      p.gross += i.grossKobo;
      people.set(i.employeeId, p);
    }
    const list = [...people.values()].sort((a, b) => a.code.localeCompare(b.code));
    for (const p of list) {
      const total = [...p.tax.values()].reduce((a, b) => a + b, 0);
      ws.addRow([p.code, p.last, p.first, p.tin, ...months.map((m) => naira(p.tax.get(m) ?? 0)), naira(total), naira(p.gross)]);
    }
    const monthTotal = (m: string) => naira(list.reduce((a, p) => a + (p.tax.get(m) ?? 0), 0));
    ws.addRow(["", "", "", "Total", ...months.map(monthTotal), naira(list.reduce((a, p) => a + [...p.tax.values()].reduce((x, y) => x + y, 0), 0)), naira(list.reduce((a, p) => a + p.gross, 0))]).font = { bold: true };
    for (let c = 5; c <= 6 + months.length; c++) { ws.getColumn(c).numFmt = money; ws.getColumn(c).width = 13; }
    [11, 18, 18, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  }
  const name = scope.kind === "month" ? `staff-tax-${scope.period}.xlsx` : `staff-tax-${scope.year}.xlsx`;
  return { bytes: Buffer.from(await wb.xlsx.writeBuffer()), name, runs: runs.length };
}
