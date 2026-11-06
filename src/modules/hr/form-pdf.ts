import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFEmbeddedPage } from "pdf-lib";
import { branchName, SCHOOL } from "@/shared/config/school";
import { env } from "@/shared/config/env";
import { storage, sniffType } from "@/shared/lib/storage";
import { STAFF_DOC_KINDS, sectionName } from "./docs";
import { employeeDetail } from "./service";

const RED = rgb(0.843, 0.149, 0.176), INK = rgb(0.137, 0.122, 0.125), MUTED = rgb(0.43, 0.4, 0.41), RULE = rgb(0.86, 0.84, 0.84), TINT = rgb(0.985, 0.95, 0.95);
/** Standard PDF fonts can't draw ₦ or characters outside Latin-1 */
const safe = (s: string) => s.replace(/₦/g, "NGN ").replace(/[–—]/g, "-").replace(/[^\x20-\xFF]/g, "?");
const day = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");

async function logo(pdf: PDFDocument) {
  try {
    const { readFile } = await import("node:fs/promises");
    return await pdf.embedPng(await readFile(`${process.cwd()}/public/logo.png`));
  } catch {
    try { const r = await fetch(`${env().APP_URL}/logo.png`); return r.ok ? await pdf.embedPng(new Uint8Array(await r.arrayBuffer())) : null; } catch { return null; }
  }
}

type Photo = { kind: "image"; img: PDFImage } | { kind: "page"; page: PDFEmbeddedPage };

/** The staff member's passport photograph: the approved one, or the newest they uploaded. JPG, PNG or a PDF scan. */
async function passport(pdf: PDFDocument, docs: { kind: string; status: string; fileKey: string }[]): Promise<Photo | null> {
  const mine = docs.filter((d) => d.kind === "passport");
  const doc = mine.find((d) => d.status === "APPROVED") ?? mine.find((d) => d.status !== "REJECTED");
  if (!doc) return null;
  try {
    const buf = await storage().get(doc.fileKey);
    if (!buf) return null;
    const t = sniffType(buf);
    if (t?.mime === "image/jpeg") return { kind: "image", img: await pdf.embedJpg(buf) };
    if (t?.mime === "image/png") return { kind: "image", img: await pdf.embedPng(buf) };
    if (t?.mime === "application/pdf") { const [page] = await pdf.embedPdf(buf, [0]); return { kind: "page", page }; }
    return null; // e.g. WebP, which a PDF can't hold: the box says the photo is on file
  } catch { return null; }
}

export type StaffFormView = {
  /** Show the salary (their own form, or a viewer with salary permission) */
  salary: boolean;
  /** Show the bank name and last four digits */
  bank: boolean;
};

/** The staff member's filled-in record on one A4 page, with their passport photograph. */
export async function staffFormPdf(id: string, view: StaffFormView) {
  const e = await employeeDetail(id);
  if (!e) return null;
  const u = e.user;
  const fullName = `${u.firstName} ${u.lastName}`;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Staff record - ${fullName} (${e.staffCode})`);
  pdf.setAuthor(SCHOOL.name);
  const page = pdf.addPage([595, 842]);
  const f = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const L = 48, R = 547;
  const text = (s: string, x: number, y: number, size = 10, font: PDFFont = f.r, color = INK) => page.drawText(safe(s), { x, y, size, font, color });
  const right = (s: string, x: number, y: number, size = 10, font: PDFFont = f.r, color = INK) => page.drawText(safe(s), { x: x - font.widthOfTextAtSize(safe(s), size), y, size, font, color });
  /** Shortens a value that wouldn't fit its column */
  const fit = (s: string, width: number, size: number, font: PDFFont) => {
    let t = safe(s);
    if (font.widthOfTextAtSize(t, size) <= width) return t;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
    return `${t}...`;
  };

  // Header, matching the payslip
  const img = await logo(pdf);
  page.drawRectangle({ x: 0, y: 830, width: 595, height: 12, color: RED });
  if (img) page.drawImage(img, { x: L, y: 752, width: 54, height: 54 });
  text(SCHOOL.name, L + 66, 788, 17, f.b);
  text(`${SCHOOL.address.line1}, ${SCHOOL.address.line2}, ${SCHOOL.address.state}`, L + 66, 772, 9, f.r, MUTED);
  text(`Tel: ${SCHOOL.phone.display}  |  ${SCHOOL.email}`, L + 66, 760, 9, f.r, MUTED);
  right("STAFF RECORD", R, 790, 16, f.b, RED);
  right(e.staffCode, R, 772, 11, f.b);
  page.drawLine({ start: { x: L, y: 740 }, end: { x: R, y: 740 }, thickness: 1, color: RED });

  // Passport photograph, top right (35 x 45 mm shape)
  const PW = 102, PH = 130, PX = R - PW, PTOP = 728;
  page.drawRectangle({ x: PX, y: PTOP - PH, width: PW, height: PH, borderColor: RULE, borderWidth: 1, color: TINT });
  const photo = await passport(pdf, e.documents);
  if (photo) {
    const size = photo.kind === "image" ? photo.img : photo.page;
    const scale = Math.min(PW / size.width, PH / size.height);
    const w = size.width * scale, h = size.height * scale, x = PX + (PW - w) / 2, y = PTOP - PH + (PH - h) / 2;
    if (photo.kind === "image") page.drawImage(photo.img, { x, y, width: w, height: h });
    else page.drawPage(photo.page, { x, y, width: w, height: h });
  } else {
    const say = e.documents.some((d) => d.kind === "passport") ? "Photo on file" : "No passport";
    text(say, PX + (PW - f.r.widthOfTextAtSize(say, 9)) / 2, PTOP - PH / 2 + 4, 9, f.r, MUTED);
    if (!e.documents.some((d) => d.kind === "passport")) text("uploaded yet", PX + (PW - f.r.widthOfTextAtSize("uploaded yet", 9)) / 2, PTOP - PH / 2 - 8, 9, f.r, MUTED);
  }

  let y = 728;
  const section = (title: string, width = R - L) => {
    page.drawRectangle({ x: L, y: y - 15, width, height: 18, color: TINT });
    text(title.toUpperCase(), L + 8, y - 10, 9, f.b, RED);
    y -= 32;
  };
  /** Label and value pairs in columns of the given width; an empty value is left as a blank line to fill in by hand */
  const rows = (items: [string, string | null | undefined][], cols: number, width = R - L) => {
    const gap = 14, cw = (width - gap * (cols - 1)) / cols;
    items.forEach(([label, value], i) => {
      const x = L + (i % cols) * (cw + gap);
      text(label, x, y, 7.5, f.r, MUTED);
      if (value) text(fit(value, cw, 10, f.b), x, y - 12, 10, f.b);
      else page.drawLine({ start: { x, y: y - 13 }, end: { x: x + cw, y: y - 13 }, thickness: 0.5, color: RULE });
      if (i % cols === cols - 1 || i === items.length - 1) y -= 30;
    });
    y -= 4;
  };

  // Personal and job details sit beside the photo
  const beside = PX - L - 16;
  section("Personal details", beside);
  rows([["Surname", u.lastName], ["First name", u.firstName], ["Email", u.email], ["Phone (WhatsApp)", e.phone], ["Gender", e.gender], ["Date of birth", day(e.dateOfBirth)]], 2, beside);
  y = Math.min(y, PTOP - PH - 18);

  section("Job");
  rows([
    ["Section", sectionName(e.section)], ["Branch", branchName(e.branch)], ["Position", e.position],
    ["Teaching staff", e.isTeacher ? "Yes" : "No"], ["Hire date", day(e.hireDate)], ["Employment", e.employmentType === "FULL_TIME" ? "Full-time" : "Part-time"],
    ...(view.salary ? [["Monthly gross salary", `NGN ${(e.monthlyGrossKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`] as [string, string]] : []),
    ["Status", e.status === "ACTIVE" ? "Active" : "Left"],
  ], 3);

  section("Tax and remittance");
  rows([
    ["Tax ID (TIN)", e.tin], ["Pension fund administrator (PFA)", e.pfaName], ["RSA PIN", e.rsaPin],
    ["NHF number", e.nhfNumber], ["NHIS / NHIA number", e.nhisNumber], ["Annual rent paid", e.annualRentNaira ? `NGN ${e.annualRentNaira.toLocaleString("en-NG")}` : null],
  ], 3);

  if (view.bank) {
    section("Bank details");
    rows([
      ["Bank", e.bankName], ["Account number", e.accountLast4 ? `******${e.accountLast4}` : null],
      ["Status", { NONE: "Not entered", PENDING: "Waiting for the Bursar", VERIFIED: "Verified", REJECTED: "Needs correcting" }[e.bankStatus]],
    ], 3);
  }

  // Documents on file: names and status only, the files themselves stay in the system
  section("Documents");
  const statusOf = (kind: string) => {
    const docs = e.documents.filter((d) => d.kind === kind);
    if (!docs.length) return "Not uploaded";
    if (docs.some((d) => d.status === "APPROVED")) return "Approved";
    if (docs.some((d) => d.status === "PENDING")) return "Waiting for review";
    return "Needs attention";
  };
  const kinds = STAFF_DOC_KINDS.filter((d) => d.required === true || (d.required === "teachers" && e.isTeacher) || e.documents.some((x) => x.kind === d.kind));
  const dw = (R - L - 14) / 2;
  kinds.forEach((d, i) => {
    const x = L + (i % 2) * (dw + 14), status = statusOf(d.kind);
    // Long names lose their bracket, e.g. "Valid ID (NIN, passport...)" becomes "Valid ID"
    text(fit(d.label.length > 38 ? d.label.split(" (")[0] : d.label, dw - 92, 8.5, f.r), x, y, 8.5);
    right(status, x + dw, y, 8.5, f.b, status === "Approved" ? INK : MUTED);
    if (i % 2 === 1 || i === kinds.length - 1) y -= 14;
  });

  // Signatures
  const SIG = 96;
  page.drawLine({ start: { x: L, y: SIG }, end: { x: L + 220, y: SIG }, thickness: 0.7, color: INK });
  page.drawLine({ start: { x: R - 220, y: SIG }, end: { x: R, y: SIG }, thickness: 0.7, color: INK });
  text("Staff member's signature and date", L, SIG - 12, 8.5, f.r, MUTED);
  text("Admin / HR signature and date", R - 220, SIG - 12, 8.5, f.r, MUTED);

  // Footer
  page.drawLine({ start: { x: L, y: 62 }, end: { x: R, y: 62 }, thickness: 0.5, color: RULE });
  const printed = new Date().toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
  text("Confidential staff record. Keep it safe, and don't share it outside the school.", L, 50, 8, f.r, MUTED);
  right(`Printed ${printed}`, R, 50, 8, f.r, MUTED);

  return { bytes: await pdf.save(), name: `Staff-record-${e.staffCode}-${fullName.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`, fullName, staffCode: e.staffCode, userId: e.userId };
}
