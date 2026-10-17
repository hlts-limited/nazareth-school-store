import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import ExcelJS from "exceljs";
import { db } from "@/shared/lib/db";
import { env } from "@/shared/config/env";
import { SCHOOL } from "@/shared/config/school";
import { periodLabel } from "./service";

const RED = rgb(0.843, 0.149, 0.176), INK = rgb(0.137, 0.122, 0.125), MUTED = rgb(0.43, 0.4, 0.41), RULE = rgb(0.86, 0.84, 0.84), TINT = rgb(0.985, 0.95, 0.95);
const safe = (s: string) => s.replace(/₦/g, "NGN ").replace(/[–—]/g, "-").replace(/[^\x20-\xFF]/g, "?");
/** Standard PDF fonts can't draw ₦ */
const ngn = (kobo: number) => `NGN ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAID_STATES = ["APPROVED", "PAID", "LOCKED"] as const;

type Lines = {
  statutory: { annualGross: number; pension: number; nhf: number; nhis: number; rentRelief: number; taxable: number; off: string[] };
  tax?: { annual: number; monthly: number };
  defaults?: { late: number; absence: number; manual: number; waived: number; carried: number; total: number; applied: number; carryForward: number; days: { late: number; absent: number; schoolDays: number } };
};

async function logo(pdf: PDFDocument) {
  try {
    const { readFile } = await import("node:fs/promises");
    return await pdf.embedPng(await readFile(`${process.cwd()}/public/logo.png`));
  } catch {
    try { const r = await fetch(`${env().APP_URL}/logo.png`); return r.ok ? await pdf.embedPng(new Uint8Array(await r.arrayBuffer())) : null; } catch { return null; }
  }
}

/** Can this payslip be seen yet? Only once the run is approved. */
export async function payslipItem(itemId: string) {
  return db.payrollItem.findUnique({ where: { id: itemId }, include: { run: true, employee: { include: { user: true } }, payments: true } });
}

/** A payslip: every stage line by line, plus year-to-date gross, pension and tax. */
export async function payslipPdf(itemId: string) {
  const it = await db.payrollItem.findUniqueOrThrow({ where: { id: itemId }, include: { run: true, employee: { include: { user: true } }, payments: true } });
  const l = it.lines as unknown as Lines;
  const year = it.run.period.slice(0, 4);
  const ytd = await db.payrollItem.findMany({ where: { employeeId: it.employeeId, run: { period: { gte: `${year}-01`, lte: it.run.period }, status: { in: [...PAID_STATES] } } } });
  const sum = (f: (x: (typeof ytd)[number]) => number) => ytd.reduce((a, x) => a + f(x), 0);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Payslip ${periodLabel(it.run.period)} - ${it.employee.user.firstName} ${it.employee.user.lastName}`);
  pdf.setAuthor(SCHOOL.name);
  const page = pdf.addPage([595, 842]);
  const f = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const img = await logo(pdf);
  const L = 48, R = 547;
  const text = (p: PDFPage, s: string, x: number, y: number, size = 10, font: PDFFont = f.r, color = INK) => p.drawText(safe(s), { x, y, size, font, color });
  const right = (p: PDFPage, s: string, x: number, y: number, size = 10, font: PDFFont = f.r, color = INK) => p.drawText(safe(s), { x: x - font.widthOfTextAtSize(safe(s), size), y, size, font, color });

  // Header
  page.drawRectangle({ x: 0, y: 830, width: 595, height: 12, color: RED });
  if (img) page.drawImage(img, { x: L, y: 752, width: 54, height: 54 });
  text(page, SCHOOL.name, L + 66, 788, 17, f.b);
  text(page, `${SCHOOL.address.line1}, ${SCHOOL.address.line2}, ${SCHOOL.address.state}`, L + 66, 772, 9, f.r, MUTED);
  text(page, `Tel: ${SCHOOL.phone.display}  |  ${SCHOOL.email}`, L + 66, 760, 9, f.r, MUTED);
  right(page, "PAYSLIP", R, 790, 18, f.b, RED);
  right(page, periodLabel(it.run.period), R, 772, 11, f.b);
  page.drawLine({ start: { x: L, y: 740 }, end: { x: R, y: 740 }, thickness: 1, color: RED });

  // Employee
  const e = it.employee;
  const emp: [string, string][] = [
    ["Name", `${e.user.firstName} ${e.user.lastName}`], ["Staff code", e.staffCode], ["Position", e.position],
    ["Bank", e.bankName ? `${e.bankName} ****${e.accountLast4}` : "-"], ["TIN", e.tin ?? "-"], ["RSA PIN", e.rsaPin ?? "-"],
  ];
  let y = 716;
  emp.forEach(([k, v], i) => {
    const x = i % 2 === 0 ? L : 310;
    if (i % 2 === 0 && i) y -= 18;
    text(page, k, x, y, 8.5, f.r, MUTED);
    text(page, v, x + 70, y, 10, f.b);
  });
  y -= 30;

  // Lines
  const section = (title: string) => {
    page.drawRectangle({ x: L, y: y - 6, width: R - L, height: 20, color: TINT });
    text(page, title.toUpperCase(), L + 8, y, 9, f.b, RED);
    y -= 22;
  };
  const row = (k: string, v: number, opts: { bold?: boolean; minus?: boolean; note?: string } = {}) => {
    text(page, k, L + 8, y, 10, opts.bold ? f.b : f.r);
    if (opts.note) text(page, opts.note, L + 220, y, 8.5, f.r, MUTED);
    right(page, `${opts.minus && v ? "- " : ""}${ngn(v)}`, R - 8, y, 10, opts.bold ? f.b : f.r);
    y -= 17;
  };
  section("Earnings");
  row("Monthly gross salary", it.grossKobo, { bold: true });
  y -= 4;
  section("Stage 1: statutory deductions");
  row("Pension (employee)", it.pensionKobo, { minus: true, note: l.statutory.off.includes("pension") ? "switched off" : undefined });
  row("National Housing Fund (NHF)", it.nhfKobo, { minus: true, note: l.statutory.off.includes("nhf") ? "switched off" : undefined });
  row("NHIS / NHIA", it.nhisKobo, { minus: true, note: l.statutory.off.includes("nhis") ? "switched off" : undefined });
  y -= 4;
  section("Stage 2: tax (PAYE)");
  row("Income tax this month", it.taxKobo, { minus: true, note: `on ${ngn(l.statutory.taxable)} taxable this year${l.statutory.rentRelief ? `, after ${ngn(l.statutory.rentRelief)} rent relief` : ""}` });
  y -= 4;
  section("Stage 3: penalties");
  const d = l.defaults;
  if (d) {
    if (d.late) row(`Lateness (${d.days.late} day${d.days.late === 1 ? "" : "s"})`, d.late, { minus: true });
    if (d.absence) row(`Absence without permission (${d.days.absent} day${d.days.absent === 1 ? "" : "s"})`, d.absence, { minus: true });
    if (d.manual) row("Other penalties", d.manual, { minus: true });
    if (d.carried) row("Carried from last month", d.carried, { minus: true });
    if (d.waived) row("Waived", d.waived);
    if (d.carryForward) row("Carried to next month", d.carryForward, { note: "not taken this month" });
  }
  row("Penalties taken", it.penaltiesKobo, { minus: true, bold: true });
  y -= 8;
  page.drawRectangle({ x: L, y: y - 10, width: R - L, height: 30, color: RED });
  text(page, "NET PAY", L + 10, y, 12, f.b, rgb(1, 1, 1));
  right(page, ngn(it.netKobo), R - 10, y, 14, f.b, rgb(1, 1, 1));
  y -= 40;

  // Year to date
  text(page, `Year to date (${year})`, L, y, 11, f.b);
  y -= 18;
  const ytdRows: [string, number][] = [["Gross", sum((x) => x.grossKobo)], ["Pension", sum((x) => x.pensionKobo)], ["Tax (PAYE)", sum((x) => x.taxKobo)], ["Net pay", sum((x) => x.netKobo)]];
  ytdRows.forEach(([k, v], i) => {
    const x = L + i * ((R - L) / 4);
    text(page, k, x, y, 8.5, f.r, MUTED);
    text(page, ngn(v), x, y - 14, 10.5, f.b);
  });
  y -= 40;

  const paid = it.payments.find((p) => p.status === "SUCCESS");
  page.drawLine({ start: { x: L, y: 60 }, end: { x: R, y: 60 }, thickness: 0.4, color: RULE });
  text(page, paid ? `Paid by bank transfer on ${paid.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" })}. Reference ${paid.reference}.` : it.held ? `Held: ${it.heldReason}.` : "Approved for payment.", L, 46, 8.5, f.r, MUTED);
  text(page, `${SCHOOL.name} | ${e.staffCode} | ${periodLabel(it.run.period)}`, L, 34, 8, f.r, MUTED);

  return { bytes: Buffer.from(await pdf.save()), name: `payslip-${it.run.period}-${e.staffCode}.pdf` };
}

// ---------- Remittance schedules ----------

export type Remittance = "pension" | "nhf" | "nhis" | "paye";
export const REMITTANCES: [Remittance, string][] = [["pension", "Pension (by PFA)"], ["nhf", "NHF"], ["nhis", "NHIS / NHIA"], ["paye", "PAYE (State Internal Revenue)"]];

/** The month's schedule for one agency, as Excel, from the approved run's figures. */
export async function remittanceXlsx(period: string, kind: Remittance) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { period }, include: { items: { include: { employee: { include: { user: true } } }, orderBy: { employee: { staffCode: "asc" } } } } });
  if (!(PAID_STATES as readonly string[]).includes(run.status)) throw new Error("NOT_APPROVED");
  const rates = (run.rates ?? {}) as { pensionEmployerPct?: number };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${kind.toUpperCase()} ${period}`);
  const name = (i: (typeof run.items)[number]) => `${i.employee.user.lastName} ${i.employee.user.firstName}`;
  const n = (k: number) => Math.round(k) / 100;
  if (kind === "pension") {
    ws.columns = [{ header: "PFA", key: "pfa", width: 28 }, { header: "RSA PIN", key: "rsa", width: 18 }, { header: "Staff code", key: "code", width: 11 }, { header: "Name", key: "name", width: 28 }, { header: "Monthly gross (NGN)", key: "gross", width: 18 }, { header: "Employee (NGN)", key: "ee", width: 15 }, { header: "Employer (NGN)", key: "er", width: 15 }, { header: "Total (NGN)", key: "t", width: 14 }];
    const rows = run.items.filter((i) => i.pensionKobo > 0).sort((a, b) => (a.employee.pfaName ?? "").localeCompare(b.employee.pfaName ?? ""));
    for (const i of rows) {
      const er = Math.round((i.grossKobo * (rates.pensionEmployerPct ?? 10)) / 100);
      ws.addRow({ pfa: i.employee.pfaName ?? "(PFA not given)", rsa: i.employee.rsaPin ?? "", code: i.employee.staffCode, name: name(i), gross: n(i.grossKobo), ee: n(i.pensionKobo), er: n(er), t: n(i.pensionKobo + er) });
    }
  } else if (kind === "nhf") {
    ws.columns = [{ header: "NHF number", key: "no", width: 18 }, { header: "Staff code", key: "code", width: 11 }, { header: "Name", key: "name", width: 28 }, { header: "Amount (NGN)", key: "amt", width: 14 }];
    for (const i of run.items.filter((x) => x.nhfKobo > 0)) ws.addRow({ no: i.employee.nhfNumber ?? "", code: i.employee.staffCode, name: name(i), amt: n(i.nhfKobo) });
  } else if (kind === "nhis") {
    ws.columns = [{ header: "NHIS / NHIA number", key: "no", width: 20 }, { header: "Staff code", key: "code", width: 11 }, { header: "Name", key: "name", width: 28 }, { header: "Amount (NGN)", key: "amt", width: 14 }];
    for (const i of run.items.filter((x) => x.nhisKobo > 0)) ws.addRow({ no: i.employee.nhisNumber ?? "", code: i.employee.staffCode, name: name(i), amt: n(i.nhisKobo) });
  } else {
    ws.columns = [{ header: "TIN", key: "tin", width: 16 }, { header: "Staff code", key: "code", width: 11 }, { header: "Name", key: "name", width: 28 }, { header: "Monthly gross (NGN)", key: "gross", width: 18 }, { header: "Annual taxable (NGN)", key: "taxable", width: 20 }, { header: "Tax this month (NGN)", key: "tax", width: 18 }];
    for (const i of run.items.filter((x) => x.taxKobo > 0)) {
      const l = i.lines as unknown as Lines;
      ws.addRow({ tin: i.employee.tin ?? "", code: i.employee.staffCode, name: name(i), gross: n(i.grossKobo), taxable: n(l.statutory.taxable), tax: n(i.taxKobo) });
    }
  }
  ws.getRow(1).font = { bold: true };
  const total = ws.addRow({});
  total.getCell(1).value = "Total";
  total.font = { bold: true };
  ws.columns.forEach((c, idx) => {
    if (idx > 0 && String(c.header).includes("(NGN)")) {
      let s = 0;
      ws.getColumn(idx + 1).eachCell((cell, r) => { if (r > 1 && typeof cell.value === "number") s += cell.value; });
      total.getCell(idx + 1).value = Math.round(s * 100) / 100;
    }
  });
  const buf = await wb.xlsx.writeBuffer();
  return { bytes: Buffer.from(buf as ArrayBuffer), name: `${kind}-remittance-${period}.xlsx` };
}
