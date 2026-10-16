import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { db } from "@/shared/lib/db";
import { env } from "@/shared/config/env";
import { SCHOOL, divisionOf } from "@/shared/config/school";

// Brand colours (the website's red), and quiet greys for the small print
const RED = rgb(0.843, 0.149, 0.176);
const RED_TINT = rgb(0.992, 0.937, 0.937);
const INK = rgb(0.137, 0.122, 0.125);
const MUTED = rgb(0.43, 0.4, 0.41);
const RULE = rgb(0.86, 0.84, 0.84);

/** Standard PDF fonts only cover Latin-1: map everything else to safe characters */
const safe = (s: string) => s.replace(/₦/g, "NGN ").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x20-\xFF]/g, "?");

const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    return await pdf.embedPng(await readFile(`${process.cwd()}/public/logo.png`));
  } catch {
    // On a host where the public folder isn't on disk, fetch it from the site itself
    try {
      const r = await fetch(`${env().APP_URL}/logo.png`);
      return r.ok ? await pdf.embedPng(new Uint8Array(await r.arrayBuffer())) : null;
    } catch { return null; }
  }
}

/** Break text into lines that fit `width` */
function wrap(font: PDFFont, text: string, size: number, width: number) {
  const lines: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else { if (line) lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

/** Draw wrapped text; returns the y below it */
function para(page: PDFPage, text: string, o: { x: number; y: number; width: number; font: PDFFont; size: number; color?: ReturnType<typeof rgb>; lead?: number }) {
  const lead = o.lead ?? o.size * 1.45;
  let y = o.y;
  for (const l of wrap(o.font, text, o.size, o.width)) { page.drawText(l, { x: o.x, y, size: o.size, font: o.font, color: o.color ?? INK }); y -= lead; }
  return y;
}

const centred = (page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = INK) =>
  page.drawText(safe(text), { x: (595 - font.widthOfTextAtSize(safe(text), size)) / 2, y, size, font, color });

export class LetterNotReady extends Error {}

/**
 * The offer of admission for a child who passed, as an A4 PDF. Only once the school has published results,
 * so a letter can't reach a family before the school announces the outcome.
 */
export async function admissionLetterPdf(applicationId: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id: applicationId }, include: { class: true, window: true, pupil: true } });
  if (!["ADMITTED", "ENROLLED"].includes(app.status)) throw new LetterNotReady("This child has not been offered admission.");
  if (!app.window.resultsPublishedAt) throw new LetterNotReady("Results have not been published yet.");

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Admission letter - ${app.otherNames} ${app.surname}`);
  pdf.setAuthor(SCHOOL.name);
  pdf.setSubject(`Offer of admission, ${app.window.session} session`);
  const page = pdf.addPage([595, 842]); // A4
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);

  const L = 56, R = 539, W = R - L;
  const child = `${app.otherNames} ${app.surname}`.replace(/\s+/g, " ").trim();
  const firstName = app.otherNames.split(/\s+/)[0];
  const school = divisionOf(app.class.name)?.name;
  const issued = app.window.resultsPublishedAt > (app.decidedAt ?? new Date(0)) ? app.window.resultsPublishedAt : app.decidedAt!;

  // Frame: red band at the top, a fine border, a faint logo behind the text
  page.drawRectangle({ x: 0, y: 830, width: 595, height: 12, color: RED });
  page.drawRectangle({ x: 24, y: 24, width: 547, height: 794, borderColor: RULE, borderWidth: 0.8 });
  if (logo) page.drawImage(logo, { x: 147, y: 250, width: 300, height: 300, opacity: 0.05 });

  // Letterhead
  if (logo) page.drawImage(logo, { x: (595 - 62) / 2, y: 748, width: 62, height: 62 });
  centred(page, SCHOOL.name.toUpperCase(), 724, serifBold, 22);
  centred(page, SCHOOL.motto, 709, serifItalic, 11, RED);
  centred(page, `${SCHOOL.address.line1}, ${SCHOOL.address.line2}, ${SCHOOL.address.state}, Nigeria`, 694, sans, 9, MUTED);
  centred(page, `Tel: ${SCHOOL.phone.display}   |   ${SCHOOL.email}   |   ${new URL(env().APP_URL).host}`, 681, sans, 9, MUTED);
  page.drawLine({ start: { x: L, y: 669 }, end: { x: R, y: 669 }, thickness: 1.2, color: RED });
  page.drawLine({ start: { x: L, y: 665 }, end: { x: R, y: 665 }, thickness: 0.4, color: RED });

  // Reference and date
  let y = 643;
  page.drawText(safe(`Ref: ${app.number}/ADM`), { x: L, y, size: 10, font: sans, color: MUTED });
  const dateText = safe(longDate(issued));
  page.drawText(dateText, { x: R - sans.widthOfTextAtSize(dateText, 10), y, size: 10, font: sans, color: MUTED });

  // Addressee
  y -= 26;
  page.drawText(safe(app.parentName), { x: L, y, size: 11.5, font: serifBold, color: INK });
  y -= 15;
  y = para(page, app.address, { x: L, y, width: 260, font: serif, size: 11, color: INK, lead: 14 });

  // Title
  y -= 10;
  centred(page, "OFFER OF ADMISSION", y, sansBold, 15, RED);
  y -= 16;
  centred(page, `${app.window.session} Academic Session`, y, serif, 11.5, MUTED);

  // Body
  y -= 26;
  page.drawText(safe(`Dear ${app.parentName},`), { x: L, y, size: 12, font: serif, color: INK });
  y -= 20;
  y = para(page, `We are delighted to inform you that your child, ${child}, passed the entrance examination and has been offered admission into ${app.class.name}${school ? ` (${school})` : ""} at ${SCHOOL.name} for the ${app.window.session} academic session.`, { x: L, y, width: W, font: serif, size: 12 });
  y -= 6;
  y = para(page, `We congratulate ${firstName} on this achievement and look forward to welcoming your family into the ${SCHOOL.name} community, where we help every child grow in wisdom, age and grace.`, { x: L, y, width: W, font: serif, size: 12 });

  // Details panel
  y -= 10;
  const rows: [string, string][] = [
    ["Pupil", child],
    ["Class", app.class.name + (school ? ` - ${school}` : "")],
    ["Session", app.window.session],
    ["Date of birth", longDate(app.dateOfBirth)],
    ["Application no.", app.number],
    ...(app.pupil ? [["Registration no.", app.pupil.regNumber] as [string, string]] : []),
  ];
  // Two columns of three: the child on the left, the paperwork on the right
  const perCol = Math.ceil(rows.length / 2);
  const ph = 16 + perCol * 18;
  page.drawRectangle({ x: L, y: y - ph, width: W, height: ph, color: RED_TINT });
  page.drawRectangle({ x: L, y: y - ph, width: 3, height: ph, color: RED });
  rows.forEach(([k, v], i) => {
    const cx = i < perCol ? L + 16 : L + W / 2 + 10;
    const ry = y - 20 - (i % perCol) * 18;
    page.drawText(safe(k), { x: cx, y: ry, size: 9.5, font: sans, color: MUTED });
    const vx = cx + (i < perCol ? 52 : 92);
    let val = safe(v);
    while (val.length > 2 && sansBold.widthOfTextAtSize(val, 10.5) > (i < perCol ? W / 2 - 80 : W / 2 - 110)) val = val.slice(0, -2) + ".";
    page.drawText(val, { x: vx, y: ry, size: 10.5, font: sansBold, color: INK });
  });
  y -= ph + 22;

  // Next steps
  page.drawText("Next steps", { x: L, y, size: 12, font: serifBold, color: INK });
  y -= 18;
  const steps = [
    `Bring this letter to the school office (${SCHOOL.officeHours}) to complete ${firstName}'s registration. The office will confirm the resumption date and school fees.`,
    `Buy ${firstName}'s books and uniforms in the School Store: sign in with the phone number on the application, ${app.parentPhone}.`,
    `For any questions, call ${SCHOOL.phone.display} or message us on WhatsApp.`,
  ];
  steps.forEach((s, i) => {
    page.drawText(`${i + 1}.`, { x: L + 4, y, size: 11.5, font: serifBold, color: RED });
    y = para(page, s, { x: L + 22, y, width: W - 22, font: serif, size: 11.5 }) - 4;
  });

  // Closing and signature
  y -= 6;
  page.drawText("Congratulations, and welcome to the Nazareth family.", { x: L, y, size: 12, font: serifItalic, color: INK });
  y -= 22;
  page.drawText("Yours faithfully,", { x: L, y, size: 12, font: serif, color: INK });
  y -= 34;
  page.drawLine({ start: { x: L, y }, end: { x: L + 170, y }, thickness: 0.6, color: INK });
  y -= 14;
  page.drawText(safe(SCHOOL.supervisor), { x: L, y, size: 11.5, font: serifBold, color: INK });
  y -= 14;
  page.drawText(safe(`Supervisor, ${SCHOOL.name}`), { x: L, y, size: 10.5, font: serif, color: MUTED });

  // Verification QR (the public results page) and footer
  const verifyUrl = `${env().APP_URL}/admissions/results`;
  const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { margin: 0, width: 240, color: { dark: "#231F20", light: "#FFFFFF" } }));
  page.drawImage(qr, { x: R - 66, y: 70, width: 66, height: 66 });
  const vt = "Scan to check this result";
  page.drawText(vt, { x: R - 33 - sans.widthOfTextAtSize(vt, 7.5) / 2, y: 60, size: 7.5, font: sans, color: MUTED });

  page.drawLine({ start: { x: L, y: 50 }, end: { x: R, y: 50 }, thickness: 0.4, color: RULE });
  const foot = safe(`This letter is valid with application number ${app.number}. Check it at ${new URL(verifyUrl).host}/admissions/results.`);
  page.drawText(foot, { x: L, y: 36, size: 7.5, font: sans, color: MUTED });

  return { bytes: Buffer.from(await pdf.save()), name: `admission-letter-${app.number}.pdf` };
}
