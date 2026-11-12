"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zInt, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { db } from "@/shared/lib/db";
import { normalizePhone } from "@/shared/lib/format";
import { readUpload } from "@/shared/lib/storage";
import { auditActor, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { notifyContact } from "@/modules/notifications";
import {
  addExamSlot, admit, changeParentPhone, correctChildDetails, decide, deleteApplication, deleteExamSlot, DOC_KINDS, docLabel, enrol, enrolMany, examMessage, markFeePaidAtOffice, renewAccessLink, saveDocument, saveWindow, setExamSlot, setResultsPublished, withdraw, type Decision, type DocKind,
} from "./service";

import { lagos, staffName, zDateTime, zDay } from "./action-helpers";

/* What the school does: exams, decisions, corrections, moving children into classes, windows. */


/** Book the exam and tell the parent on WhatsApp and by email. Returns whether the message failed. */
async function scheduleAndTell(id: string, slotId: string | null) {
  const before = await db.application.findUniqueOrThrow({ where: { id }, select: { examSlotId: true } });
  const app = await setExamSlot(id, slotId);
  let told = true;
  if (app.examSlot && app.examSlotId !== before.examSlotId) {
    const errors = await notifyContact({ phone: app.parentPhone, email: app.parentEmail }, "Entrance exam date", examMessage(app, app.examSlot));
    told = errors.length === 0;
  }
  return { app, told };
}

export async function setExamSlotAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const d = parseForm(z.object({ id: zText(100), slotId: z.string().optional() }), form);
    const { app, told } = await scheduleAndTell(d.id, d.slotId || null);
    await audit(await auditActor(v), app.examSlot ? "Scheduled entrance exam" : "Removed exam slot", "Application", app.id, { number: app.number, slot: app.examSlot?.startsAt.toISOString() });
    if (!app.examSlot) return ok("Exam slot removed.");
    return ok(`Exam booked. The family sees it on the website${told ? " and has been sent a text/email" : ", but the text/email didn't go through, so please call them"}.`);
  });
}

/** Ticked rows on the Applications list: book an exam slot or record the result for many children at once. */
export async function bulkApplicationsAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const ids = form.getAll("ids").map(String).filter(Boolean);
    if (!ids.length) return fail("Tick at least one application first.");
    const op = form.get("bulkDelete") ? "DELETE" : String(form.get("op") ?? "");
    const actor = await auditActor(v);
    const canEnrol = v.permissions.has("pupils.manage");
    let done = 0;
    let enrolled = 0;
    const problems: string[] = [];
    for (const id of ids) {
      const app = await db.application.findUnique({ where: { id }, select: { number: true } });
      if (!app) continue;
      try {
        if (op === "DELETE") {
          const gone = await deleteApplication(id);
          await audit(actor, "Deleted application", "Application", id, deletedDetails(gone));
        } else if (op === "ADMITTED" && canEnrol) {
          const r = await admit(id, undefined, v.user.id);
          await audit(actor, "Recorded admission decision", "Application", id, { number: app.number, decision: op });
          if (r.pupil) {
            enrolled++;
            await audit(actor, "Enrolled applicant as pupil", "Application", id, { reg: r.pupil.regNumber, class: r.app.classId });
          } else problems.push(`${app.number}: admitted, but not moved into class (${r.problem})`);
        } else if (op.startsWith("slot:")) {
          const { app: a, told } = await scheduleAndTell(id, op.slice(5));
          if (!told) problems.push(`${a.number}: text/email not sent`);
          await audit(actor, "Scheduled entrance exam", "Application", id, { number: a.number, slot: a.examSlot?.startsAt.toISOString() });
        } else if (["ADMITTED", "WAITLISTED", "NOT_ADMITTED"].includes(op)) {
          await decide(id, op as Decision, undefined, v.user.id);
          await audit(actor, "Recorded admission decision", "Application", id, { number: app.number, decision: op });
        } else return fail("Choose what to do with the ticked applications.");
        done++;
      } catch (e) {
        problems.push(`${app.number}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    const what = op === "DELETE" ? "deleted" : op.startsWith("slot:") ? "booked for the exam" : "updated";
    const moved = op === "ADMITTED" && enrolled ? ` ${enrolled} moved into their class${enrolled === 1 ? "" : "es"} for the School Store.` : "";
    return { ok: done > 0, message: `${done} application${done === 1 ? "" : "s"} ${what}.${moved}${problems.length ? ` Not done: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? ` and ${problems.length - 3} more` : ""}.` : ""}` };
  });
}

/** Move admitted children into the classes they applied for (creates the pupils; parents get School Store invites). */
export async function enrolManyAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    if (!v.permissions.has("pupils.manage")) return fail("You need permission to add pupils to do this.");
    const ids = form.getAll("ids").map(String).filter(Boolean);
    if (!ids.length) return fail("Tick at least one child first.");
    const r = await enrolMany(ids);
    const actor = await auditActor(v);
    for (const d of r.done) await audit(actor, "Enrolled applicant as pupil", "Application", d.id, { reg: d.reg, class: d.className });
    const invited = r.done.filter((d) => d.parentCreated).length;
    const msg = `${r.done.length} child${r.done.length === 1 ? "" : "ren"} moved into ${r.done.length === 1 ? "their class" : "their classes"}.${invited ? ` ${invited} new parent${invited === 1 ? "" : "s"} invited to the School Store.` : ""}`;
    return { ok: r.done.length > 0, message: r.failed.length ? `${msg} Not moved: ${r.failed.map((f) => `${f.name} (${f.reason})`).join("; ")}` : msg };
  });
}

export async function markFeePaidAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const app = await markFeePaidAtOffice(String(form.get("id")), staffName(v));
    await audit(await auditActor(v), "Recorded form fee paid at the office", "Application", app.id, { number: app.number, amount: app.feeAmount });
    return ok("Form fee recorded as paid. The application is now with the school.");
  });
}

/** Staff add or replace a document for the family. */
export async function staffUploadDocAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const app = await db.application.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
    const kind = String(form.get("kind")) as DocKind;
    if (!DOC_KINDS.some((k) => k.kind === kind)) return fail("Choose a document.");
    const existing = await db.applicationDocument.findUnique({ where: { applicationId_kind: { applicationId: app.id, kind } } });
    if (existing && kind !== "passport") return fail("Only the passport photograph can be replaced. The certificates stay as the family sent them.");
    const file = form.get("file") as File | null;
    const up = await readUpload(file, { allowPdf: kind !== "passport" });
    if ("error" in up) return fail(up.error!, { [`file-${kind}`]: up.error! });
    await saveDocument(app.id, kind, { buf: up.buf, mime: up.mime, ext: up.ext, name: file?.name ?? kind });
    await audit(await auditActor(v), existing ? "Replaced applicant passport photo" : "Uploaded applicant document", "Application", app.id, { number: app.number, kind });
    return ok(`${docLabel(kind, (app.details as Record<string, string> | null)?.religion)} uploaded.`);
  });
}

/** Correct the child's name or date of birth; a sworn affidavit must come with the change. */
export async function correctChildAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const d = parseForm(z.object({
      id: zText(100), surname: zText(80, "Enter the child's surname"), otherNames: zText(120, "Enter the child's other names"), dateOfBirth: zDay("Enter the date of birth"),
    }), form);
    const file = form.get("affidavit") as File | null;
    let affidavit = null;
    if (file && file.size) {
      const up = await readUpload(file, { allowPdf: true });
      if ("error" in up) return fail(up.error!, { affidavit: up.error! });
      affidavit = { buf: up.buf, mime: up.mime, ext: up.ext, name: file.name || "affidavit" };
    }
    const dob = lagos(d.dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) return fail("Check the date of birth.", { dateOfBirth: "Check the date of birth" });
    const r = await correctChildDetails(d.id, { surname: d.surname, otherNames: d.otherNames, dateOfBirth: dob }, affidavit, staffName(v));
    await audit(await auditActor(v), "Corrected child's details", "Application", d.id, { number: r.app.number, from: r.correction.from, to: r.correction.to, affidavit: r.correction.affidavit, classFrom: r.correction.classFrom, classTo: r.correction.classTo });
    const cls = r.correction.classTo ? ` The class is now ${r.correction.classTo}, by the new age.` : "";
    return ok(`Details corrected and the affidavit saved.${cls}${r.enrolled ? " The pupil record has the new name too." : ""}`);
  });
}

export async function changeParentPhoneAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const phone = normalizePhone(String(form.get("phone") ?? ""));
    if (!phone) return fail("Enter a valid Nigerian phone number.", { phone: "Not a valid number" });
    const r = await changeParentPhone(String(form.get("id")), phone);
    await audit(await auditActor(v), "Changed parent phone", "Application", r.app.id, { number: r.app.number, from: r.before, to: phone });
    return ok("Phone number updated.");
  });
}

/** A fresh private link for the family to copy or send on WhatsApp. The previous link stops working. */
export async function renewLinkAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const { app, link } = await renewAccessLink(String(form.get("id")));
    await audit(await auditActor(v), "Created new family link", "Application", app.id, { number: app.number });
    return { ok: true, message: "New link ready. The old link no longer works.", data: { link, number: app.number, phone: app.parentPhone } };
  });
}

export async function decideAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const d = parseForm(z.object({ id: zText(100), decision: z.enum(["ADMITTED", "WAITLISTED", "NOT_ADMITTED"]), note: zOptText(300) }), form);
    const actor = await auditActor(v);
    if (d.decision === "ADMITTED" && v.permissions.has("pupils.manage")) {
      const r = await admit(d.id, d.note, v.user.id);
      await audit(actor, "Recorded admission decision", "Application", r.app.id, { number: r.app.number, decision: d.decision });
      if (!r.pupil) return ok(`Admitted, but not moved into class yet: ${r.problem}. Move them from Admitted pupils.`);
      await audit(actor, "Enrolled applicant as pupil", "Pupil", r.pupil.id, { application: r.app.id, reg: r.pupil.regNumber, by: staffName(v) });
      return ok(`Admitted and moved into class as ${r.pupil.regNumber}. The parent can now buy books and items in the School Store.${r.parentCreated ? " A School Store invite has been sent to the parent." : ""}`);
    }
    const app = await decide(d.id, d.decision, d.note, v.user.id);
    await audit(actor, "Recorded admission decision", "Application", app.id, { number: app.number, decision: d.decision });
    const w = await db.admissionWindow.findUnique({ where: { id: app.windowId } });
    return ok(w?.resultsPublishedAt ? "Decision saved. Results are published, so the family can see it now." : "Decision saved. Families see decisions once you publish results.");
  });
}

export async function withdrawAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const app = await withdraw(String(form.get("id")));
    await audit(await auditActor(v), "Withdrew application", "Application", app.id, { number: app.number });
    return ok("Application marked as withdrawn.");
  });
}

const deletedDetails = (a: Awaited<ReturnType<typeof deleteApplication>>) => ({
  number: a.number, child: `${a.otherNames} ${a.surname}`, parentPhone: a.parentPhone, status: a.status,
  feeAmount: a.feeAmount, feePaid: !!a.feePaidAt, feeRef: a.feeRef, pupil: a.pupil?.regNumber ?? null,
});

/** Delete an application and its documents for good (e.g. a duplicate or test entry). Kept in the audit log. */
export async function deleteApplicationAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const app = await deleteApplication(String(form.get("id")));
    await audit(await auditActor(v), "Deleted application", "Application", app.id, deletedDetails(app));
    return { ok: true, message: `Application ${app.number} deleted.${app.pupil ? ` The pupil ${app.pupil.regNumber} is kept.` : ""}`, redirect: "/admin/admissions" };
  });
}

export async function enrolAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    if (!v.permissions.has("pupils.manage")) return fail("You need permission to add pupils to enrol a child.");
    const d = parseForm(z.object({ id: zText(100), regNumber: zText(40, "Enter the reg number"), classId: zText(100, "Choose a class") }), form);
    const r = await enrol(d.id, { regNumber: d.regNumber, classId: d.classId });
    await audit(await auditActor(v), "Enrolled applicant as pupil", "Pupil", r.pupil.id, { application: d.id, reg: r.pupil.regNumber, by: staffName(v) });
    return ok(`${r.pupil.firstName} ${r.pupil.lastName} is now a pupil (${r.pupil.regNumber}).${r.parentCreated ? " The parent has been invited to the School Store." : ""}`);
  });
}

export async function saveWindowAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.publish");
    const d = parseForm(z.object({
      id: z.string().optional(), session: z.string().trim().regex(/^\d{4}\/\d{4}$/, "Use the format 2027/2028"),
      opensAt: zDay("Choose the opening date"), closesAt: zDay("Choose the closing date"), formFee: zInt(0, "Enter the form fee (0 for free)"), note: zOptText(300),
    }), form);
    // The window opens at the start of the opening day and closes at the end of the closing day (Lagos time)
    const closes = lagos(d.closesAt);
    closes.setTime(closes.getTime() + 86400_000);
    const w = await saveWindow(d.id || undefined, { session: d.session, opensAt: lagos(d.opensAt), closesAt: closes, formFee: d.formFee, note: d.note });
    await audit(await auditActor(v), d.id ? "Updated admission window" : "Created admission window", "AdmissionWindow", w.id, { session: w.session, opensAt: d.opensAt, closesAt: d.closesAt, formFee: d.formFee });
    return ok(d.id ? "Admission window saved." : `Admission window for ${w.session} created.`);
  });
}

export async function publishResultsAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.publish");
    const publish = form.get("publish") === "1";
    const w = await setResultsPublished(String(form.get("id")), publish);
    await audit(await auditActor(v), publish ? "Published admission results" : "Unpublished admission results", "AdmissionWindow", w.id, { session: w.session });
    return ok(publish ? "Results published. Families can now check their result online." : "Results hidden from the website.");
  });
}

export async function addExamSlotAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.publish");
    const d = parseForm(z.object({
      windowId: zText(100), startsAt: zDateTime("Choose the date and time"), venue: zText(120, "Enter the venue"), capacity: zInt(1, "Enter how many children"), note: zOptText(200),
    }), form);
    const s = await addExamSlot(d.windowId, { startsAt: lagos(d.startsAt), venue: d.venue, capacity: d.capacity, note: d.note });
    await audit(await auditActor(v), "Added exam slot", "ExamSlot", s.id, { startsAt: d.startsAt, venue: d.venue, capacity: d.capacity });
    return ok("Exam slot added.");
  });
}

export async function deleteExamSlotAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.publish");
    const s = await deleteExamSlot(String(form.get("id")));
    await audit(await auditActor(v), "Deleted exam slot", "ExamSlot", s.id, { startsAt: s.startsAt.toISOString(), venue: s.venue });
    return ok("Exam slot deleted.");
  });
}
