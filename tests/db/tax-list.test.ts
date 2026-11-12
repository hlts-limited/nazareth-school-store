// Runs against the throwaway test database: npm run test:db (after payroll.test.ts has approved a run)
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { db } from "../../src/shared/lib/db";
import { taxListScope, taxListXlsx } from "../../src/modules/payroll/tax-list";

test("staff tax list: a month lists every staff member's tax; a year totals the months", async () => {
  assert.equal(taxListScope("2026-13x"), null);
  assert.deepEqual(taxListScope("2026"), { kind: "year", year: "2026" });
  const run = await db.payrollRun.findFirst({ where: { status: { in: ["APPROVED", "PAID", "LOCKED"] } }, include: { items: true }, orderBy: { period: "desc" } });
  assert.ok(run, "the payroll tests leave an approved run");

  const read = async (bytes: Buffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as unknown as ArrayBuffer); return wb.worksheets[0]; };
  const month = await taxListXlsx({ kind: "month", period: run.period });
  assert.equal(month.name, `staff-tax-${run.period}.xlsx`);
  const ws = await read(month.bytes);
  const header = ws.getRow(3).values as unknown[];
  assert.ok(header.includes("Tax (PAYE) deducted") && header.includes("TIN"));
  const total = ws.getRow(3 + run.items.length + 1);
  assert.equal(total.getCell(4).value, "Total");
  assert.equal(total.getCell(10).value, run.items.reduce((a, i) => a + i.taxKobo, 0) / 100, "total tax matches the run");
  assert.equal(ws.rowCount, 3 + run.items.length + 1, "one row per staff member on the run, then the total");

  const year = await taxListXlsx({ kind: "year", year: run.period.slice(0, 4) });
  const yws = await read(year.bytes);
  const yhead = (yws.getRow(3).values as unknown[]).filter(Boolean) as string[];
  assert.ok(yhead.includes("Total tax (PAYE)"));
  const runsThatYear = await db.payrollRun.findMany({ where: { status: { in: ["APPROVED", "PAID", "LOCKED"] }, period: { startsWith: run.period.slice(0, 4) } }, include: { items: true } });
  const yearTax = runsThatYear.flatMap((r) => r.items).reduce((a, i) => a + i.taxKobo, 0) / 100;
  const ytotal = yws.getRow(yws.rowCount);
  assert.equal(ytotal.getCell(4 + runsThatYear.length + 1).value, yearTax, "the year's total tax adds up");
});
