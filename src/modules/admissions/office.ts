import type { ApplicationStatus, Prisma } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { storage } from "@/shared/lib/storage";
import { env } from "@/shared/config/env";
import { SCHOOL_DIVISIONS } from "@/shared/config/school";
import { addPupil, suggestRegNumber } from "@/modules/pupils";

/* The back office: searching applications, exam slots, decisions and moving admitted children into classes. */

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
