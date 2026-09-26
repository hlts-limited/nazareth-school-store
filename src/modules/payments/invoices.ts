import type { OrderStatus, Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "@/shared/lib/db";
import { fmtDate, invoiceNo, orderNo, parseOrderNo } from "@/shared/lib/format";
import { SCHOOL } from "@/shared/config/school";
import { invoiceLabel, statusesFor, type InvoiceLabel } from "@/modules/orders";

export type InvoiceFilters = { classId?: string; from?: string; to?: string; status?: InvoiceLabel; q?: string };

export type InvoiceRow = {
  invoice: string; order: string; date: Date; parent: string; pupil: string; regNumber: string; className: string;
  method: string; amount: number; status: InvoiceLabel;
};

/** Lagos day boundaries → UTC instants */
const dayStart = (d: string) => new Date(`${d}T00:00:00+01:00`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+01:00`);

/** One row per pupil per order, so class totals add up correctly. */
export async function invoiceRows(f: InvoiceFilters): Promise<InvoiceRow[]> {
  const where: Prisma.OrderWhereInput = {};
  if (f.from || f.to) where.createdAt = { ...(f.from ? { gte: dayStart(f.from) } : {}), ...(f.to ? { lte: dayEnd(f.to) } : {}) };
  if (f.status) where.status = { in: statusesFor(f.status) as OrderStatus[] };
  if (f.classId) where.lines = { some: { pupil: { classId: f.classId } } };
  const q = f.q?.trim();
  if (q) {
    const n = /(\d{4,})/.exec(q)?.[1];
    where.OR = [
      { parent: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] } },
      { lines: { some: { pupil: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { regNumber: { contains: q, mode: "insensitive" } }] } } } },
      ...(n && parseOrderNo(n) ? [{ number: parseOrderNo(n)! }] : []),
    ];
  }
  const orders = await db.order.findMany({
    where, orderBy: { createdAt: "desc" }, take: 5000,
    include: { parent: true, lines: { include: { pupil: { include: { class: true } } } } },
  });
  const rows: InvoiceRow[] = [];
  for (const o of orders) {
    const byPupil = new Map<string, typeof o.lines>();
    for (const l of o.lines) byPupil.set(l.pupilId, [...(byPupil.get(l.pupilId) ?? []), l]);
    for (const [, ls] of byPupil) {
      const p = ls[0].pupil;
      if (f.classId && p.classId !== f.classId) continue;
      rows.push({
        invoice: invoiceNo(o.number), order: orderNo(o.number), date: o.createdAt,
        parent: `${o.parent.firstName} ${o.parent.lastName}`, pupil: `${p.firstName} ${p.lastName}`, regNumber: p.regNumber, className: p.class.name,
        method: o.method === "PAYSTACK" ? "Paystack" : o.method === "WALLET" ? "Wallet" : "Transfer",
        amount: ls.reduce((a, l) => a + l.qty * l.unitPrice, 0), status: invoiceLabel(o.status),
      });
    }
  }
  return rows;
}

const HEAD = ["Invoice", "Order", "Date", "Parent", "Pupil", "Reg no.", "Class", "Method", "Amount (NGN)", "Status"];
const cells = (r: InvoiceRow) => [r.invoice, r.order, fmtDate(r.date), r.parent, r.pupil, r.regNumber, r.className, r.method, r.amount, r.status];

export function toCsv(rows: InvoiceRow[]) {
  const esc = (v: unknown) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // Leading BOM so Excel opens ₦ and accents correctly
  return "﻿" + [HEAD, ...rows.map(cells)].map((r) => r.map(esc).join(",")).join("\r\n");
}

export async function toXlsx(rows: InvoiceRow[], title: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = SCHOOL.storeName;
  const ws = wb.addWorksheet("Invoices", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.addRow([`${SCHOOL.name} — ${title}`]).font = { bold: true, size: 13 };
  ws.addRow([`Exported ${fmtDate(new Date())} · ${rows.length} rows`]).font = { color: { argb: "FF756E70" } };
  const h = ws.addRow(HEAD);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD7262D" } }; });
  rows.forEach((r) => ws.addRow(cells(r)));
  const total = ws.addRow(["", "", "", "", "", "", "", "Total", rows.reduce((a, r) => a + r.amount, 0), ""]);
  total.font = { bold: true };
  ws.getColumn(9).numFmt = "#,##0";
  [12, 11, 13, 22, 22, 15, 13, 10, 14, 11].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- PDF helpers ----------
const RED = rgb(0.843, 0.149, 0.176), INK = rgb(0.137, 0.122, 0.125), MUTED = rgb(0.46, 0.43, 0.44);
/** Standard PDF fonts can't draw ₦; use "NGN" in PDFs */
const pdfMoney = (n: number) => `NGN ${Math.round(n).toLocaleString("en-NG")}`;

/** Standard PDF fonts only cover Latin-1: map everything else to safe characters */
function safe(s: string) {
  return s.replace(/₦/g, "NGN ").replace(/[–—]/g, "-").replace(/·/g, "|").replace(/…/g, "...").replace(/[^\x20-\xFF]/g, "?");
}
function draw(page: PDFPage, text: string, opts: Parameters<PDFPage["drawText"]>[1]) {
  page.drawText(safe(text), opts);
}
function textFit(font: PDFFont, s: string, size: number, maxW: number) {
  let t = safe(s);
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + ".";
  return t;
}

async function logoImage(pdf: PDFDocument) {
  try {
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(`${process.cwd()}/public/icon-192.png`);
    return await pdf.embedPng(bytes);
  } catch { return null; }
}

export async function toPdf(rows: InvoiceRow[], title: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await logoImage(pdf);
  const cols = [60, 58, 62, 110, 110, 70, 62, 52, 70, 58];
  let page: PDFPage = pdf.addPage([842, 595]); // A4 landscape
  let y = 0;
  const header = () => {
    y = 555;
    if (logo) page.drawImage(logo, { x: 30, y: y - 8, width: 30, height: 30 });
    draw(page, `${SCHOOL.name} — ${title}`, { x: 68, y: y + 8, size: 13, font: bold, color: INK });
    draw(page, `Exported ${fmtDate(new Date())} · ${rows.length} rows`, { x: 68, y: y - 6, size: 9, font, color: MUTED });
    y -= 34;
    let x = 30;
    page.drawRectangle({ x: 26, y: y - 5, width: 790, height: 18, color: RED });
    HEAD.forEach((hd, i) => { draw(page, hd, { x: x + 2, y, size: 8, font: bold, color: rgb(1, 1, 1) }); x += cols[i]; });
    y -= 18;
  };
  header();
  for (const r of rows) {
    if (y < 40) { page = pdf.addPage([842, 595]); header(); }
    let x = 30;
    cells(r).forEach((c, i) => {
      const s = i === 8 ? pdfMoney(Number(c)) : String(c);
      draw(page, textFit(font, s, 8, cols[i] - 4), { x: x + 2, y, size: 8, font, color: INK });
      x += cols[i];
    });
    y -= 14;
  }
  y -= 6;
  draw(page, `Total: ${pdfMoney(rows.reduce((a, r) => a + r.amount, 0))}`, { x: 620, y: Math.max(y, 24), size: 10, font: bold, color: INK });
  return Buffer.from(await pdf.save());
}

/** Invoice / receipt for one order (parent download) */
export async function orderInvoicePdf(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { parent: true, lines: { include: { pupil: { include: { class: true } } } }, payments: true } });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await logoImage(pdf);
  const page = pdf.addPage([595, 842]);
  let y = 790;
  if (logo) page.drawImage(logo, { x: 40, y: y - 20, width: 48, height: 48 });
  draw(page, SCHOOL.name, { x: 100, y: y + 10, size: 16, font: bold, color: INK });
  draw(page, SCHOOL.motto, { x: 100, y: y - 6, size: 9, font, color: RED });
  const paid = ["PAYMENT_APPROVED", "PACKING", "READY", "PARTIALLY_HANDED_OUT", "HANDED_OUT"].includes(o.status);
  draw(page, paid ? "RECEIPT" : "INVOICE", { x: 440, y: y + 10, size: 18, font: bold, color: paid ? rgb(0.11, 0.49, 0.28) : INK });
  draw(page, invoiceNo(o.number), { x: 440, y: y - 6, size: 10, font, color: MUTED });
  y -= 60;
  const kv = (k: string, v: string) => { draw(page, k, { x: 40, y, size: 9, font, color: MUTED }); draw(page, v, { x: 140, y, size: 10, font: bold, color: INK }); y -= 16; };
  kv("Order", orderNo(o.number));
  kv("Date", fmtDate(o.createdAt));
  kv("Parent", `${o.parent.firstName} ${o.parent.lastName}`);
  kv("Status", invoiceLabel(o.status));
  y -= 10;
  page.drawRectangle({ x: 36, y: y - 5, width: 523, height: 18, color: RED });
  ["Pupil", "Item", "Qty", "Price", "Amount"].forEach((h, i) => draw(page, h, { x: [40, 150, 390, 430, 500][i], y, size: 9, font: bold, color: rgb(1, 1, 1) }));
  y -= 20;
  for (const l of o.lines) {
    draw(page, textFit(font, `${l.pupil.firstName} (${l.pupil.class.name})`, 9, 105), { x: 40, y, size: 9, font, color: INK });
    draw(page, textFit(font, l.itemName + (l.variantLabel !== "Standard" ? ` (${l.variantLabel})` : "") + (l.pileName ? ` · ${l.pileName}` : ""), 9, 235), { x: 150, y, size: 9, font, color: INK });
    draw(page, String(l.qty), { x: 390, y, size: 9, font, color: INK });
    draw(page, pdfMoney(l.unitPrice), { x: 430, y, size: 9, font, color: INK });
    draw(page, pdfMoney(l.unitPrice * l.qty), { x: 500, y, size: 9, font, color: INK });
    y -= 15;
    if (y < 120) break;
  }
  y -= 10;
  const sum = (k: string, v: string) => { draw(page, k, { x: 380, y, size: 10, font, color: MUTED }); draw(page, v, { x: 480, y, size: 10, font: bold, color: INK }); y -= 16; };
  sum("Subtotal", pdfMoney(o.subtotal));
  if (o.walletUsed) sum("Paid from wallet", pdfMoney(o.walletUsed));
  if (o.amountReceived) sum("Payments received", pdfMoney(o.amountReceived));
  if (o.excess) sum("Extra to wallet", pdfMoney(o.excess));
  sum("Balance", pdfMoney(Math.max(0, o.subtotal - o.walletUsed - o.amountReceived)));
  draw(page, `Pick up at ${SCHOOL.pickupPlace}.`, { x: 40, y: 60, size: 8, font, color: MUTED });
  return { bytes: Buffer.from(await pdf.save()), name: `${paid ? "receipt" : "invoice"}-${orderNo(o.number)}.pdf` };
}

