import { PDFDocument, StandardFonts, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { db } from "@/shared/lib/db";
import { storage, sniffType } from "@/shared/lib/storage";
import { env } from "@/shared/config/env";
import { SCHOOL, divisionOf } from "@/shared/config/school";
import { docLabel } from "./docs";

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

/** The child's passport photograph, if it was uploaded as a JPG or PNG (the formats a PDF can carry). */
async function passportImage(pdf: PDFDocument, docs: { kind: string; fileKey: string }[]) {
  const doc = docs.find((d) => d.kind === "passport");
  if (!doc) return null;
  try {
    const buf = await storage().get(doc.fileKey);
    if (!buf) return null;
    const t = sniffType(buf);
    if (t?.mime === "image/jpeg") return await pdf.embedJpg(buf);
    if (t?.mime === "image/png") return await pdf.embedPng(buf);
    return null; // WebP: no PDF support; the box shows a placeholder instead
  } catch { return null; }
}

/** The photo in a passport-sized frame (35 x 45 proportions), cropped to fill */
function drawPassport(page: PDFPage, img: PDFImage | null, x: number, top: number, w: number, font: PDFFont) {
  const h = Math.round(w * 45 / 35);
  page.drawRectangle({ x: x - 3, y: top - h - 3, width: w + 6, height: h + 6, color: rgb(1, 1, 1), borderColor: RULE, borderWidth: 0.8 });
  if (img) {
    // Fill the frame: scale to cover, centre, and let the frame's edges crop it
    const scale = Math.max(w / img.width, h / img.height);
    const iw = img.width * scale, ih = img.height * scale;
    page.pushOperators(pushGraphicsState(), rectangle(x, top - h, w, h), clip(), endPath());
    page.drawImage(img, { x: x + (w - iw) / 2, y: top - h + (h - ih) / 2, width: iw, height: ih });
    page.pushOperators(popGraphicsState());
  } else {
    page.drawRectangle({ x, y: top - h, width: w, height: h, color: rgb(0.96, 0.95, 0.95) });
    const t = "Passport photo";
    page.drawText(t, { x: x + (w - font.widthOfTextAtSize(t, 7.5)) / 2, y: top - h / 2, size: 7.5, font, color: MUTED });
  }
  return h;
}

type Fonts = { serif: PDFFont; serifBold: PDFFont; serifItalic: PDFFont; sans: PDFFont; sansBold: PDFFont };

/** A4 page with the frame, the faint logo behind the text and the school letterhead. Returns where the body starts. */
async function letterheadPage(pdf: PDFDocument) {
  const page = pdf.addPage([595, 842]);
  const f: Fonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRoman), serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    serifItalic: await pdf.embedFont(StandardFonts.TimesRomanItalic), sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await loadLogo(pdf);
  const L = 56, R = 539;
  page.drawRectangle({ x: 0, y: 830, width: 595, height: 12, color: RED });
  page.drawRectangle({ x: 24, y: 24, width: 547, height: 794, borderColor: RULE, borderWidth: 0.8 });
  if (logo) page.drawImage(logo, { x: 147, y: 250, width: 300, height: 300, opacity: 0.05 });
  if (logo) page.drawImage(logo, { x: (595 - 62) / 2, y: 748, width: 62, height: 62 });
  centred(page, SCHOOL.name.toUpperCase(), 724, f.serifBold, 22);
  centred(page, SCHOOL.motto, 709, f.serifItalic, 11, RED);
  centred(page, `${SCHOOL.address.line1}, ${SCHOOL.address.line2}, ${SCHOOL.address.state}, Nigeria`, 694, f.sans, 9, MUTED);
  centred(page, `Tel: ${SCHOOL.phone.display}   |   ${SCHOOL.email}   |   ${new URL(env().APP_URL).host}`, 681, f.sans, 9, MUTED);
  page.drawLine({ start: { x: L, y: 669 }, end: { x: R, y: 669 }, thickness: 1.2, color: RED });
  page.drawLine({ start: { x: L, y: 665 }, end: { x: R, y: 665 }, thickness: 0.4, color: RED });
  return { page, f, top: 643 };
}

/**
 * The offer of admission for a child who passed, as an A4 PDF. Only once the school has published results,
 * so a letter can't reach a family before the school announces the outcome.
 */
export async function admissionLetterPdf(applicationId: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id: applicationId }, include: { class: true, window: true, pupil: true, documents: true } });
  if (!["ADMITTED", "ENROLLED"].includes(app.status)) throw new LetterNotReady("This child has not been offered admission.");
  if (!app.window.resultsPublishedAt) throw new LetterNotReady("Results have not been published yet.");

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Admission letter - ${app.otherNames} ${app.surname}`);
  pdf.setAuthor(SCHOOL.name);
  pdf.setSubject(`Offer of admission, ${app.window.session} session`);
  const { page, f, top } = await letterheadPage(pdf);
  const { serif, serifBold, serifItalic, sans, sansBold } = f;
  const photo = await passportImage(pdf, app.documents);

  const L = 56, R = 539, W = R - L;
  const child = `${app.otherNames} ${app.surname}`.replace(/\s+/g, " ").trim();
  const firstName = app.otherNames.split(/\s+/)[0];
  const school = divisionOf(app.class.name)?.name;
  const issued = app.window.resultsPublishedAt > (app.decidedAt ?? new Date(0)) ? app.window.resultsPublishedAt : app.decidedAt!;

  // Reference and date, with the child's photo on the right below the date
  let y = top;
  page.drawText(safe(`Ref: ${app.number}/ADM`), { x: L, y, size: 10, font: sans, color: MUTED });
  const dateText = safe(longDate(issued));
  page.drawText(dateText, { x: R - sans.widthOfTextAtSize(dateText, 10), y, size: 10, font: sans, color: MUTED });

  drawPassport(page, photo, R - 72, y - 12, 72, sans);

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

// ---------- Printable admission form ----------

const STATUS_WORDS: Record<string, string> = {
  AWAITING_PAYMENT: "Awaiting form fee", SUBMITTED: "Received", EXAM_SCHEDULED: "Exam booked", ADMITTED: "Admitted",
  WAITLISTED: "Waiting list", NOT_ADMITTED: "Not admitted", ENROLLED: "Admitted and placed in class", WITHDRAWN: "Withdrawn",
};

function fit(font: PDFFont, s: string, size: number, maxW: number) {
  let t = safe(s);
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + ".";
  return t;
}

/**
 * The completed application form as an A4 PDF, for the family's and the school's files. It shows the child's
 * passport photo, every answer, the documents received, the exam booking and the declaration.
 */
export async function applicationFormPdf(applicationId: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id: applicationId }, include: { class: true, window: true, examSlot: true, documents: true, pupil: true } });
  const d = (app.details ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" && d[k] ? String(d[k]) : "-");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Application form - ${app.otherNames} ${app.surname} (${app.number})`);
  pdf.setAuthor(SCHOOL.name);
  const { page: first, f, top } = await letterheadPage(pdf);
  const { serif, sans, sansBold } = f;
  let page = first;
  const L = 56, R = 539, W = R - L;
  const school = divisionOf(app.class.name)?.name;
  const photo = await passportImage(pdf, app.documents);

  let y = top;
  const room = (h: number) => {
    if (y - h >= 58) return;
    page = pdf.addPage([595, 842]);
    page.drawRectangle({ x: 0, y: 830, width: 595, height: 12, color: RED });
    page.drawRectangle({ x: 24, y: 24, width: 547, height: 794, borderColor: RULE, borderWidth: 0.8 });
    page.drawText(safe(`${SCHOOL.name} | Application ${app.number} (continued)`), { x: L, y: 795, size: 9, font: sans, color: MUTED });
    y = 770;
  };

  // Title block, with the photo on the right
  page.drawText("APPLICATION FOR ADMISSION", { x: L, y, size: 15, font: sansBold, color: RED });
  const meta: [string, string][] = [
    ["Application no.", app.number],
    ["Session", app.window.session],
    ["Class applied for", `${app.class.name}${school ? ` (${school})` : ""}`],
    ["Submitted", app.submittedAt ? longDate(app.submittedAt) : "Not yet (form fee awaited)"],
    ["Status", STATUS_WORDS[app.status] ?? app.status],
    ...(app.pupil ? [["Registration no.", app.pupil.regNumber] as [string, string]] : []),
  ];
  let my = y - 24;
  for (const [k, v] of meta) {
    page.drawText(k, { x: L, y: my, size: 9.5, font: sans, color: MUTED });
    page.drawText(fit(sansBold, v, 10.5, 250), { x: L + 105, y: my, size: 10.5, font: sansBold, color: INK });
    my -= 15;
  }
  const ph = drawPassport(page, photo, R - 76, y + 6, 76, sans);
  y = Math.min(my, y + 6 - ph - 6) - 6;

  const section = (title: string) => {
    y -= 4;
    room(56);
    page.drawText(safe(title.toUpperCase()), { x: L, y, size: 10, font: sansBold, color: RED });
    page.drawLine({ start: { x: L, y: y - 5 }, end: { x: R, y: y - 5 }, thickness: 0.6, color: RED });
    y -= 20;
  };
  /** Boxes of label-over-answer, `cols` to a row, as on a paper form */
  const grid = (fields: [string, string][], cols = 3) => {
    const gap = 12, cw = (W - gap * (cols - 1)) / cols;
    for (let i = 0; i < fields.length; i += cols) {
      room(26);
      fields.slice(i, i + cols).forEach(([k, v], j) => {
        const x = L + j * (cw + gap);
        page.drawText(fit(sans, k, 8, cw), { x, y, size: 8, font: sans, color: MUTED });
        page.drawText(fit(sansBold, v || "-", 10.5, cw), { x, y: y - 13, size: 10.5, font: sansBold, color: INK });
        page.drawLine({ start: { x, y: y - 17 }, end: { x: x + cw, y: y - 17 }, thickness: 0.5, color: RULE });
      });
      y -= 27;
    }
  };
  const wide = (k: string, v: string) => {
    room(26);
    page.drawText(safe(k), { x: L, y, size: 8, font: sans, color: MUTED });
    const lines = wrap(sansBold, v || "-", 10.5, W);
    lines.forEach((l, i) => page.drawText(l, { x: L, y: y - 13 - i * 13, size: 10.5, font: sansBold, color: INK }));
    const under = y - 17 - (lines.length - 1) * 13;
    page.drawLine({ start: { x: L, y: under }, end: { x: R, y: under }, thickness: 0.5, color: RULE });
    y -= 27 + (lines.length - 1) * 13;
  };

  section("1. The child");
  grid([
    ["Surname", app.surname], ["Other names", app.otherNames], ["Date of birth", longDate(app.dateOfBirth)],
    ["Gender", app.gender], ["Class applied for", app.class.name], ["School", school ?? "-"],
    ["Current or last school", app.previousSchool ?? "-"], ["Current class", str("currentClass")], ["Religion", str("religion")],
    ["Nationality", str("nationality")], ["State of origin", str("stateOfOrigin")], ["Languages spoken", str("languages")],
  ]);

  section("2. Parent or guardian");
  grid([
    ["Full name", app.parentName], ["Relationship", app.relationship], ["Phone", app.parentPhone],
    ["Email", app.parentEmail ?? "-"], ["Occupation", str("occupation")], ["Other parent", str("otherParentName")],
    ["Other parent's phone", str("otherParentPhone")],
  ]);
  wide("Home address", app.address);

  section("3. Health, documents and entrance exam");
  if (str("health") !== "-") wide("Health, sight, speech or learning needs", str("health"));
  const religion = typeof d.religion === "string" ? d.religion : null;
  const has = (k: string) => (app.documents.some((x) => x.kind === k) ? "Received" : "Not received");
  grid([
    ["Passport photograph", has("passport")], [docLabel("faith", religion).replace(/ \(.*$/, ""), has("faith")], ["Birth certificate", has("birth")],
    ...(app.examSlot
      ? [["Exam date and time", app.examSlot.startsAt.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })], ["Exam venue", app.examSlot.venue], ["Health needs", str("health") === "-" ? "None given" : "See above"]] as [string, string][]
      : [["Entrance exam", "Not booked yet"], ["Health needs", str("health") === "-" ? "None given" : "See above"]] as [string, string][]),
  ]);

  const corrections = Array.isArray(d.corrections) ? (d.corrections as { at: string }[]) : [];
  if (corrections.length) {
    room(24);
    y = para(page, `The child's name or date of birth was corrected by the school office on ${corrections.map((c) => longDate(new Date(c.at))).join(", ")}, with a sworn affidavit on file.`, { x: L, y, width: W, font: serif, size: 10, color: MUTED }) - 6;
  }

  section("Declaration");
  room(80);
  y = para(page, "I confirm the information above is true. If my child is ill or injured at school, I agree they may receive treatment at the nearest approved medical centre at my expense. I agree that the school may store this information to process the application (Nigeria Data Protection Act 2023).", { x: L, y, width: W, font: serif, size: 10, lead: 13.5 });
  y -= 4;
  page.drawText(safe(`Accepted by ${app.parentName}${app.submittedAt ? ` on ${longDate(app.submittedAt)}` : ""}.`), { x: L, y, size: 10.5, font: sansBold, color: INK });
  y -= 26;
  room(24);
  page.drawLine({ start: { x: L, y }, end: { x: L + 200, y }, thickness: 0.6, color: INK });
  page.drawLine({ start: { x: R - 200, y }, end: { x: R, y }, thickness: 0.6, color: INK });
  page.drawText("Parent's signature and date", { x: L, y: y - 12, size: 8.5, font: sans, color: MUTED });
  page.drawText("For the school office", { x: R - 200, y: y - 12, size: 8.5, font: sans, color: MUTED });

  for (const p of pdf.getPages()) {
    p.drawLine({ start: { x: L, y: 50 }, end: { x: R, y: 50 }, thickness: 0.4, color: RULE });
    p.drawText(safe(`${SCHOOL.name} | Application ${app.number} | Printed ${longDate(new Date())}`), { x: L, y: 36, size: 7.5, font: sans, color: MUTED });
  }
  return { bytes: Buffer.from(await pdf.save()), name: `application-form-${app.number}.pdf` };
}
