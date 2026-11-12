import type { AdmissionWindow } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";

/* When admission is open, admission windows and exam slots. */

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

export async function upcomingExams() {
  const s = await admissionStatus();
  if (!s.window) return [];
  return db.examSlot.findMany({ where: { windowId: s.window.id, startsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } });
}

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
