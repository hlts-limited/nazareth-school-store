import { randomBytes } from "node:crypto";
import type { AdmissionWindow, ApplicationStatus, Prisma } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { hmac, randomToken, safeEqual, sha256 } from "@/shared/lib/crypto";
import { storage } from "@/shared/lib/storage";
import { env } from "@/shared/config/env";
import { SCHOOL_DIVISIONS } from "@/shared/config/school";
import { initializeTransaction, verifyTransaction } from "@/modules/payments";
import { addPupil, suggestRegNumber } from "@/modules/pupils";
import { admissionClassFor, lagosDay } from "@/shared/lib/admission-age";
import { DOC_KINDS, type DocKind } from "./docs";

export { DOC_KINDS, RELIGIONS, docLabel, type DocKind } from "./docs";

// ---------- Admission windows: is admission open? ----------

export type AdmissionStatus = {
  open: boolean;
  window: AdmissionWindow | null; // the open window, else the next one, else the most recent
  upcoming: boolean; // window opens in the future
};

export async function admissionStatus(now = new Date()): Promise<AdmissionStatus> {
  const open = await db.admissionWindow.findFirst({ where: { opensAt: { lte: now }, closesAt: { gt: now } }, orderBy: { opensAt: "desc" } });
  if (open) return { open: true, window: open, upcoming: false };
  const next = await db.admissionWindow.findFirst({ where: { opensAt: { gt: now } }, orderBy: { opensAt: "asc" } });
  if (next) return { open: false, window: next, upcoming: true };
  const last = await db.admissionWindow.findFirst({ orderBy: { closesAt: "desc" } });
  return { open: false, window: last, upcoming: false };
}

const lagosDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

/** One sentence for the announcement bar and the admission pages */
export function admissionNotice(s: AdmissionStatus): string {
  if (s.open && s.window) return `Admission for the ${s.window.session} session is open until ${lagosDate(new Date(s.window.closesAt.getTime() - 1))}.`;
  if (s.upcoming && s.window) return `Admission for the ${s.window.session} session opens on ${lagosDate(s.window.opensAt)}.`;
  if (s.window) return `Admission for the ${s.window.session} session has closed. Contact the school office to find out when the next admission opens.`;
  return "Admission is currently closed. Contact the school office to find out when the next admission opens.";
}

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

export async function upcomingExams() {
  const s = await admissionStatus();
  if (!s.window) return [];
  return db.examSlot.findMany({ where: { windowId: s.window.id, startsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } });
}

// ---------- Back office ----------

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  AWAITING_PAYMENT: "Form fee unpaid",
  SUBMITTED: "New",
  EXAM_SCHEDULED: "Exam scheduled",
  ADMITTED: "Admitted",
  WAITLISTED: "Waiting list",
  NOT_ADMITTED: "Not admitted",
  ENROLLED: "Enrolled",
  WITHDRAWN: "Withdrawn",
};

export const PER_PAGE = 25;

export type ApplicationSearch = { windowId?: string; status?: string; classId?: string; school?: string; q?: string; page?: number };

export async function listApplications(s: ApplicationSearch) {
  const where: Prisma.ApplicationWhereInput = {};
  if (s.windowId) where.windowId = s.windowId;
  if (s.status && s.status in STATUS_LABEL) where.status = s.status as ApplicationStatus;
  if (s.classId) where.classId = s.classId;
  const division = SCHOOL_DIVISIONS.find((d) => d.id === s.school);
  if (division) where.class = { name: { in: [...division.classes] } };
  const q = s.q?.trim();
  if (q) {
    where.AND = q.split(/\s+/).map((w) => ({
      OR: [
        { surname: { contains: w, mode: "insensitive" } },
        { otherNames: { contains: w, mode: "insensitive" } },
        { number: { contains: w, mode: "insensitive" } },
        { parentPhone: { contains: w.replace(/\D/g, "") || w } },
      ],
    }));
  }
  const page = Math.max(1, s.page ?? 1);
  const [rows, total, byStatus] = await Promise.all([
    db.application.findMany({
      where, include: { class: true, documents: { select: { kind: true } }, examSlot: true },
      orderBy: [{ createdAt: "desc" }], take: PER_PAGE, skip: (page - 1) * PER_PAGE,
    }),
    db.application.count({ where }),
    db.application.groupBy({ by: ["status"], where: s.windowId ? { windowId: s.windowId } : {}, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) as Partial<Record<ApplicationStatus, number>>;
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)), counts };
}

export async function applicationDetail(id: string) {
  return db.application.findUnique({
    where: { id },
    include: { class: true, window: { include: { examSlots: { orderBy: { startsAt: "asc" }, include: { _count: { select: { applications: true } } } } } }, examSlot: true, documents: true, pupil: true },
  });
}

export async function setExamSlot(id: string, slotId: string | null) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  if (!["SUBMITTED", "EXAM_SCHEDULED"].includes(app.status)) throw new UserError("Exam slots can only be changed before a decision is made.");
  if (slotId) {
    const slot = await db.examSlot.findFirst({ where: { id: slotId, windowId: app.windowId }, include: { _count: { select: { applications: true } } } });
    if (!slot) throw new UserError("Choose an exam slot.");
    if (slot._count.applications >= slot.capacity && app.examSlotId !== slot.id) throw new UserError("That exam slot is full.");
  }
  return db.application.update({ where: { id }, data: { examSlotId: slotId, status: slotId ? "EXAM_SCHEDULED" : "SUBMITTED" }, include: { examSlot: true } });
}

export type Decision = "ADMITTED" | "WAITLISTED" | "NOT_ADMITTED";

export async function decide(id: string, decision: Decision, note: string | undefined, staffId: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  if (["AWAITING_PAYMENT", "ENROLLED", "WITHDRAWN"].includes(app.status)) throw new UserError(`This application is ${STATUS_LABEL[app.status].toLowerCase()}, so it can't be decided.`);
  return db.application.update({ where: { id }, data: { status: decision, decisionNote: note ?? null, decidedById: staffId, decidedAt: new Date() } });
}

/** "Passed: admit": record the decision, then put the child straight into the class they applied for, so the
 *  family can shop in the School Store. If that fails (e.g. a clash), the child stays on "Admitted pupils" to move later. */
export async function admit(id: string, note: string | undefined, staffId: string) {
  const app = await decide(id, "ADMITTED", note, staffId);
  try {
    const r = await enrol(id, { regNumber: await suggestRegNumber(), classId: app.classId });
    return { app, pupil: r.pupil, parentCreated: r.parentCreated, problem: null };
  } catch (e) {
    return { app, pupil: null, parentCreated: false, problem: e instanceof UserError ? e.message : "the pupil could not be created" };
  }
}

/** Remove an application and its uploaded documents for good. A pupil already created from it is kept. */
export async function deleteApplication(id: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id }, include: { documents: true, pupil: true } });
  await db.application.delete({ where: { id } });
  for (const d of app.documents) await storage().delete(d.fileKey).catch(() => undefined);
  return app;
}

export async function withdraw(id: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  if (app.status === "ENROLLED") throw new UserError("This child is already enrolled. Archive the pupil instead.");
  return db.application.update({ where: { id }, data: { status: "WITHDRAWN", examSlotId: null } });
}

/** Turn an admitted application into a pupil, linked to (or inviting) the parent by phone number. */
export async function enrol(id: string, opts: { regNumber: string; classId: string }) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  if (app.status !== "ADMITTED") throw new UserError("Only admitted applications can be enrolled.");
  const r = await addPupil({
    firstName: app.otherNames, lastName: app.surname, regNumber: opts.regNumber, classId: opts.classId, gender: app.gender,
    parentPhone: app.parentPhone, parentName: app.parentName, parentEmail: app.parentEmail ?? undefined, relationship: app.relationship,
  });
  await db.application.update({ where: { id }, data: { status: "ENROLLED", pupilId: r.pupil.id } });
  return r;
}

/** Admitted children not yet moved into a class, and those already moved, for the "Admitted pupils" page. */
export async function admittedList(windowId?: string) {
  const where = windowId ? { windowId } : {};
  const [waiting, enrolled] = await Promise.all([
    db.application.findMany({ where: { ...where, status: "ADMITTED" }, include: { class: true }, orderBy: [{ class: { sortOrder: "asc" } }, { surname: "asc" }] }),
    db.application.findMany({ where: { ...where, status: "ENROLLED" }, include: { class: true, pupil: { include: { class: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
  ]);
  return { waiting, enrolled };
}

/** Move admitted children into the class they applied for, with the next reg numbers. One failure doesn't stop the rest. */
export async function enrolMany(ids: string[]) {
  const done: { id: string; name: string; reg: string; className: string; parentCreated: boolean }[] = [];
  const failed: { id: string; name: string; reason: string }[] = [];
  for (const id of ids) {
    const app = await db.application.findUnique({ where: { id }, include: { class: true } });
    if (!app) continue;
    const name = `${app.otherNames.split(/\s+/)[0]} ${app.surname}`;
    try {
      const r = await enrol(id, { regNumber: await suggestRegNumber(), classId: app.classId });
      done.push({ id, name, reg: r.pupil.regNumber, className: app.class.name, parentCreated: r.parentCreated });
    } catch (e) {
      failed.push({ id, name, reason: e instanceof UserError ? e.message : "Unexpected error" });
    }
  }
  return { done, failed };
}

/** Text for the parent when an exam is booked (WhatsApp and email; the family's page shows it too). */
export const examMessage = (app: { otherNames: string; number: string }, slot: { startsAt: Date; venue: string }) =>
  `${app.otherNames.split(/\s+/)[0]}'s entrance exam is on ${slot.startsAt.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })} at ${slot.venue}. Please arrive 30 minutes early. Application ${app.number}. Check it any time at ${env().APP_URL}/admissions/results`;

// ---------- Windows and exam slots ----------

export async function listWindows() {
  return db.admissionWindow.findMany({
    orderBy: { opensAt: "desc" },
    include: { examSlots: { orderBy: { startsAt: "asc" }, include: { _count: { select: { applications: true } } } }, _count: { select: { applications: true } } },
  });
}

export type WindowInput = { session: string; opensAt: Date; closesAt: Date; formFee: number; note?: string };

export async function saveWindow(id: string | undefined, input: WindowInput) {
  if (input.closesAt <= input.opensAt) throw new UserError("The closing date must be after the opening date.", { closesAt: "Must be after the opening date" });
  const overlap = await db.admissionWindow.findFirst({
    where: { id: id ? { not: id } : undefined, opensAt: { lt: input.closesAt }, closesAt: { gt: input.opensAt } },
  });
  if (overlap) throw new UserError(`These dates overlap the ${overlap.session} window. Only one window can be open at a time.`, { opensAt: "Overlaps another window" });
  if (id) {
    const w = await db.admissionWindow.findUniqueOrThrow({ where: { id }, include: { _count: { select: { applications: { where: { feeAmount: { gt: 0 } } } } } } });
    if (w.formFee !== input.formFee && w._count.applications > 0) throw new UserError("Families have already paid the current form fee, so it can't be changed for this window.", { formFee: "Already in use" });
    return db.admissionWindow.update({ where: { id }, data: input });
  }
  return db.admissionWindow.create({ data: input });
}

export async function setResultsPublished(windowId: string, publish: boolean) {
  return db.admissionWindow.update({ where: { id: windowId }, data: { resultsPublishedAt: publish ? new Date() : null } });
}

export async function addExamSlot(windowId: string, input: { startsAt: Date; venue: string; capacity: number; note?: string }) {
  return db.examSlot.create({ data: { windowId, ...input } });
}

export async function deleteExamSlot(id: string) {
  const slot = await db.examSlot.findUniqueOrThrow({ where: { id }, include: { _count: { select: { applications: true } } } });
  if (slot._count.applications) throw new UserError("Move the children booked into this slot first.");
  await db.examSlot.delete({ where: { id } });
  return slot;
}
