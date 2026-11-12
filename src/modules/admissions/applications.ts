import { randomBytes } from "node:crypto";
import type { AdmissionWindow, ApplicationStatus, Prisma } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { hmac, randomToken, safeEqual, sha256 } from "@/shared/lib/crypto";
import { storage } from "@/shared/lib/storage";
import { env } from "@/shared/config/env";
import { initializeTransaction, verifyTransaction } from "@/modules/payments";
import { admissionClassFor, lagosDay } from "@/shared/lib/admission-age";
import { DOC_KINDS, type DocKind } from "./docs";
import { admissionStatus } from "./windows";

/* Applications from families: the form, the private link, the form fee, documents, corrections and result lookup. */

// ---------- Applications from the public website ----------

const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L

/** NZA27-7K3QXM: the year the session starts, then 6 random characters, so numbers can't be guessed in order. */
function newApplicationNumber(session: string) {
  const yy = (session.match(/\d{4}/)?.[0] ?? String(new Date().getFullYear())).slice(2);
  const bytes = randomBytes(6);
  return `NZA${yy}-${[...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("")}`;
}

export const normaliseAppNumber = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

export type NewApplication = {
  classId: string; surname: string; otherNames: string; dateOfBirth: Date; gender: string; previousSchool?: string;
  parentName: string; relationship: string; parentPhone: string; parentEmail?: string; address: string;
  details: Record<string, string | undefined>;
};

/** The class a child is admitted into, by age on 31 December of the session's first year (see shared/lib/admission-age). */
export async function classForChild(dob: Date, session: string) {
  const r = admissionClassFor(lagosDay(dob), session);
  if (!r.className) return { ...r, classId: null };
  const cls = await db.class.findUnique({ where: { name: r.className } });
  if (!cls) throw new UserError(`The ${r.className} class is missing. Ask the Super Admin to check the class list.`);
  return { ...r, classId: cls.id };
}

/** How the form fee was handled when the office registers a child */
export type OfficeFee = "paid" | "online" | "waived";

/**
 * Online: the open window, class by age. Office: any window, class by age unless staff choose another.
 * Returns the family's private link (the token is only known now).
 */
export async function createApplication(input: Omit<NewApplication, "classId"> & { classId?: string }, office?: { windowId: string; fee: OfficeFee; by: string }) {
  let w: AdmissionWindow | null;
  if (office) {
    w = await db.admissionWindow.findUnique({ where: { id: office.windowId } });
    if (!w) throw new UserError("Choose the admission session.", { windowId: "Required" });
  } else {
    const status = await admissionStatus();
    if (!status.open || !status.window) throw new UserError("Admission is not open at the moment.");
    w = status.window;
  }
  const byAge = await classForChild(input.dateOfBirth, w.session);
  const classId = office && input.classId ? input.classId : byAge.classId;
  if (!classId) throw new UserError(byAge.problem ?? "Check the date of birth.", { dateOfBirth: byAge.problem ?? "Check the date of birth" });
  if (office && !(await db.class.findUnique({ where: { id: classId } }))) throw new UserError("Choose a class.", { classId: "Choose a class" });

  const fee = office ? (office.fee === "waived" ? 0 : w.formFee) : w.formFee;
  const paidNow = office?.fee === "paid" && fee > 0;
  const awaiting = fee > 0 && !paidNow;
  const token = randomToken(24);
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = newApplicationNumber(w.session);
    if (await db.application.findUnique({ where: { number } })) continue;
    const app = await db.application.create({
      data: {
        number, accessTokenHash: sha256(token), windowId: w.id, classId,
        status: awaiting ? "AWAITING_PAYMENT" : "SUBMITTED", submittedAt: awaiting ? null : new Date(), feePaidAt: paidNow ? new Date() : null,
        surname: input.surname, otherNames: input.otherNames, dateOfBirth: input.dateOfBirth, gender: input.gender, previousSchool: input.previousSchool,
        parentName: input.parentName, relationship: input.relationship, parentPhone: input.parentPhone, parentEmail: input.parentEmail, address: input.address,
        details: { ...input.details, ...(office ? { registeredBy: office.by, formFee: office.fee } : {}) } as Prisma.InputJsonValue, feeAmount: fee,
      },
    });
    return { app, token, link: applicationPath(app.number, token) };
  }
  throw new Error("Could not allocate an application number");
}

/** A new private link for the family (the old one stops working). For when they lose it, or the office registered the child. */
export async function renewAccessLink(id: string) {
  const token = randomToken(24);
  const app = await db.application.update({ where: { id }, data: { accessTokenHash: sha256(token) } });
  return { app, link: `${env().APP_URL}${applicationPath(app.number, token)}` };
}

export const applicationPath = (number: string, token: string) => `/admissions/application/${number}/${token}`;

/** The family's private link: the application number plus a secret token that only they were given. */
export async function applicationByToken(number: string, token: string) {
  const app = await db.application.findUnique({
    where: { number: normaliseAppNumber(number) },
    include: { class: true, window: true, examSlot: true, documents: true },
  });
  if (!app || !token || !safeEqual(app.accessTokenHash, sha256(token))) return null;
  return app;
}

// ---------- Form fee (Paystack) ----------

export const isApplicationFeeRef = (ref: string) => ref.startsWith("NZA");

export async function startApplicationFee(number: string, token: string) {
  const app = await applicationByToken(number, token);
  if (!app) throw new UserError("Application not found.");
  if (app.status !== "AWAITING_PAYMENT") throw new UserError("The form fee for this application is already paid.");
  const reference = `${app.number}-${randomToken(6).replace(/[^a-zA-Z0-9]/g, "")}`;
  await db.application.update({ where: { id: app.id }, data: { feeRef: reference } });
  const email = app.parentEmail ?? `applicant-${app.parentPhone}@noemail.nazareth-school.ng`;
  const { authorizationUrl } = await initializeTransaction({
    email, amountNaira: app.feeAmount, reference,
    callbackUrl: `${env().APP_URL}${applicationPath(app.number, token)}`,
    metadata: { application: app.number, purpose: "Admission form" },
  });
  return authorizationUrl;
}

/** Idempotent: called from the family's return to the site and from the Paystack webhook. */
export async function confirmApplicationFee(reference: string): Promise<"paid" | "already" | "failed"> {
  const app = await db.application.findUnique({ where: { feeRef: reference } });
  if (!app) return "failed";
  if (app.status !== "AWAITING_PAYMENT") return "already";
  const v = await verifyTransaction(reference);
  const received = v.amountNaira === -1 ? app.feeAmount : v.amountNaira; // -1: simulated checkout in development
  if (!v.success || v.currency !== "NGN" || received < app.feeAmount) return "failed";
  const r = await db.application.updateMany({
    where: { id: app.id, status: "AWAITING_PAYMENT" },
    data: { status: "SUBMITTED", feePaidAt: new Date(), submittedAt: new Date() },
  });
  return r.count ? "paid" : "already";
}

/** The family paid the form fee at the school office: the application goes through to the school. */
export async function markFeePaidAtOffice(id: string, by: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  if (app.status !== "AWAITING_PAYMENT") throw new UserError("The form fee for this application is already settled.");
  return db.application.update({
    where: { id },
    data: { status: "SUBMITTED", feePaidAt: new Date(), submittedAt: new Date(), details: { ...((app.details ?? {}) as Record<string, unknown>), feePaidAtOffice: by } as Prisma.InputJsonValue },
  });
}

// ---------- Documents ----------

export async function saveDocument(applicationId: string, kind: DocKind | `affidavit-${number}`, file: { buf: Buffer; mime: string; ext: string; name: string }) {
  const key = `admissions/${applicationId}/${kind}-${randomToken(8).replace(/[^a-zA-Z0-9]/g, "")}.${file.ext}`;
  await storage().put(key, file.buf, file.mime);
  const old = await db.applicationDocument.findUnique({ where: { applicationId_kind: { applicationId, kind } } });
  await db.applicationDocument.upsert({
    where: { applicationId_kind: { applicationId, kind } },
    create: { applicationId, kind, fileKey: key, fileName: file.name.slice(0, 120), mimeType: file.mime, size: file.buf.length },
    update: { fileKey: key, fileName: file.name.slice(0, 120), mimeType: file.mime, size: file.buf.length, uploadedAt: new Date() },
  });
  if (old) await storage().delete(old.fileKey);
}

/** Affidavits filed with name or date-of-birth corrections, oldest first */
export const affidavits = <D extends { kind: string; uploadedAt: Date }>(docs: D[]) =>
  docs.filter((d) => d.kind.startsWith("affidavit-")).sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());

export type Correction = { at: string; by: string; from: { surname: string; otherNames: string; dateOfBirth: string }; to: { surname: string; otherNames: string; dateOfBirth: string }; affidavit: string; classFrom?: string; classTo?: string };

/**
 * The office corrects the child's name or date of birth after the form was submitted. A sworn affidavit must be
 * uploaded with every such change; it is kept with the application, and the change is recorded in its history.
 * A new date of birth re-checks the class by age (for a child not yet in class).
 */
export async function correctChildDetails(id: string, to: { surname: string; otherNames: string; dateOfBirth: Date }, affidavit: { buf: Buffer; mime: string; ext: string; name: string } | null, by: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id }, include: { class: true, window: true, documents: true, pupil: true } });
  const day = lagosDay;
  const nameChanged = app.surname !== to.surname || app.otherNames !== to.otherNames;
  const dobChanged = day(app.dateOfBirth) !== day(to.dateOfBirth);
  if (!nameChanged && !dobChanged) throw new UserError("Nothing has changed. Edit the name or date of birth first.");
  if (!affidavit) throw new UserError("Upload the sworn affidavit for this change.", { affidavit: "Required for a name or date-of-birth change" });

  let classId = app.classId, classTo: string | undefined;
  if (dobChanged && app.status !== "ENROLLED") {
    const r = await classForChild(to.dateOfBirth, app.window.session);
    if (!r.classId) throw new UserError(r.problem ?? "With this date of birth the child can't be admitted this session.", { dateOfBirth: "Outside the admission ages" });
    if (r.classId !== app.classId) { classId = r.classId; classTo = r.className ?? undefined; }
  }

  const n = affidavits(app.documents).length + 1;
  const kind = `affidavit-${n}` as const;
  await saveDocument(app.id, kind, affidavit);
  const correction: Correction = {
    at: new Date().toISOString(), by,
    from: { surname: app.surname, otherNames: app.otherNames, dateOfBirth: day(app.dateOfBirth) },
    to: { surname: to.surname, otherNames: to.otherNames, dateOfBirth: day(to.dateOfBirth) },
    affidavit: kind, ...(classTo ? { classFrom: app.class.name, classTo } : {}),
  };
  const details = (app.details ?? {}) as Record<string, unknown>;
  const corrections = Array.isArray(details.corrections) ? (details.corrections as Correction[]) : [];
  const updated = await db.application.update({
    where: { id },
    data: { surname: to.surname, otherNames: to.otherNames, dateOfBirth: to.dateOfBirth, classId, details: { ...details, corrections: [...corrections, correction] } as Prisma.InputJsonValue },
  });
  // A child already in class: their pupil record carries the name too
  if (app.pupil && nameChanged) await db.pupil.update({ where: { id: app.pupil.id }, data: { firstName: to.otherNames, lastName: to.surname } });
  return { app: updated, correction, enrolled: !!app.pupil };
}

/** The office updates the parent's phone number. No document is needed. */
export async function changeParentPhone(id: string, phone: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  if (app.parentPhone === phone) throw new UserError("That is already the phone number on the application.", { phone: "Unchanged" });
  return { before: app.parentPhone, app: await db.application.update({ where: { id }, data: { parentPhone: phone } }) };
}

export const missingDocs = (docs: { kind: string }[]) => DOC_KINDS.filter((d) => d.required && !docs.some((x) => x.kind === d.kind));

// ---------- Result lookup (public) ----------

export const DECIDED: ApplicationStatus[] = ["ADMITTED", "WAITLISTED", "NOT_ADMITTED", "ENROLLED"];

/** Application number + first letter of the surname. Shows only the first name, class and outcome. */
export async function lookupResult(number: string, surnameInitial: string) {
  const app = await db.application.findUnique({ where: { number: normaliseAppNumber(number) }, include: { class: true, window: true, examSlot: true } });
  if (!app || app.surname.trim()[0]?.toUpperCase() !== surnameInitial.trim()[0]?.toUpperCase() || app.status === "AWAITING_PAYMENT") return null;
  const published = !!app.window.resultsPublishedAt;
  return {
    number: app.number,
    firstName: app.otherNames.split(/\s+/)[0],
    className: app.class.name,
    session: app.window.session,
    exam: app.examSlot ? { startsAt: app.examSlot.startsAt, venue: app.examSlot.venue } : null,
    outcome: published && DECIDED.includes(app.status) ? (app.status === "ENROLLED" ? "ADMITTED" : app.status) : app.status === "WITHDRAWN" ? "WITHDRAWN" : null,
  };
}

// ---------- Short-lived document links (from the results page) ----------

export type FamilyDoc = "letter" | "form";
const DOC_LINK_HOURS = 2;
const docSig = (number: string, doc: FamilyDoc, exp: number) => hmac(env().SESSION_SECRET, `family-doc:${number}:${doc}:${exp}`);

/** A link to the admission letter or form that works for 2 hours, given to a family who just checked their result. */
export function familyDocLink(number: string, doc: FamilyDoc) {
  const exp = Math.floor(Date.now() / 1000) + DOC_LINK_HOURS * 3600;
  return `/admissions/results/document?n=${encodeURIComponent(number)}&doc=${doc}&exp=${exp}&sig=${docSig(number, doc, exp)}`;
}

/** The application a document link points to, if the link is genuine and not expired. */
export async function applicationForDocLink(q: { n?: string | null; doc?: string | null; exp?: string | null; sig?: string | null }) {
  const doc = q.doc === "letter" || q.doc === "form" ? q.doc : null;
  const exp = Number(q.exp);
  if (!q.n || !doc || !Number.isFinite(exp) || !q.sig || exp < Date.now() / 1000) return null;
  if (!safeEqual(q.sig, docSig(q.n, doc, exp))) return null;
  const app = await db.application.findUnique({ where: { number: q.n } });
  return app ? { app, doc } : null;
}
