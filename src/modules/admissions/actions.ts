"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zInt, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { db } from "@/shared/lib/db";
import { normalizePhone } from "@/shared/lib/format";
import { requestMeta } from "@/shared/lib/request";
import { readUpload } from "@/shared/lib/storage";
import { auditActor, isLocked, recordAttempt, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { notifyContact } from "@/modules/notifications";
import {
  addExamSlot, applicationByToken, createApplication, decide, deleteExamSlot, DOC_KINDS, docLabel, enrol, enrolMany, examMessage, lookupResult, RELIGIONS,
  renewAccessLink, saveDocument, saveWindow, setExamSlot, setResultsPublished, startApplicationFee, withdraw, type Decision, type DocKind,
} from "./service";

const zDay = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const zDateTime = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, msg);
const lagos = (local: string) => new Date(`${local.length === 10 ? `${local}T00:00` : local}:00+01:00`);

// ---------- Public: apply, pay, upload, check result ----------

type Upload = { kind: DocKind; buf: Buffer; mime: string; ext: string; name: string };

/** The application form's fields and documents, shared by the website and the office. */
async function readApplicationForm(form: FormData, opts: { docsRequired: boolean; declaration: boolean }) {
  const d = parseForm(z.object({
    surname: zText(80, "Enter the child's surname"), otherNames: zText(120, "Enter the child's other names"),
    dateOfBirth: zDay("Enter the date of birth"), gender: z.enum(["Female", "Male"], { errorMap: () => ({ message: "Choose the gender" }) }),
    previousSchool: zOptText(160), currentClass: zOptText(60),
    nationality: zOptText(60), stateOfOrigin: zOptText(60), languages: zOptText(120),
    religion: z.enum(RELIGIONS, { errorMap: () => ({ message: "Choose the religion" }) }),
    parentName: zText(120, "Enter the parent's full name"), relationship: zText(40, "Choose the relationship to the child"),
    parentPhone: zText(20, "Enter a phone number"), parentEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
    occupation: zOptText(80), address: zText(300, "Enter the home address"),
    otherParentName: zOptText(120), otherParentPhone: zOptText(20),
    health: zOptText(600),
    declaration: opts.declaration ? z.literal("on", { errorMap: () => ({ message: "Please confirm the declaration" }) }) : z.string().optional(),
  }), form);
  const errors: Record<string, string> = {};
  const phone = normalizePhone(d.parentPhone);
  if (!phone) errors.parentPhone = "Enter a valid Nigerian phone number, e.g. 08031234567";
  const dob = lagos(d.dateOfBirth);
  if (Number.isNaN(dob.getTime()) || dob > new Date()) errors.dateOfBirth = "Check the date of birth";

  const uploads: Upload[] = [];
  for (const doc of DOC_KINDS) {
    const file = form.get(`doc-${doc.kind}`) as File | null;
    if (!file || !file.size) {
      if (opts.docsRequired && doc.required) errors[`doc-${doc.kind}`] = `Upload the ${docLabel(doc.kind, d.religion).toLowerCase()}`;
      continue;
    }
    const up = await readUpload(file, { allowPdf: doc.kind !== "passport" });
    if ("error" in up) { errors[`doc-${doc.kind}`] = up.error!; continue; }
    uploads.push({ kind: doc.kind, buf: up.buf, mime: up.mime, ext: up.ext, name: file.name });
  }
  if (Object.keys(errors).length) return { valid: false as const, result: fail("Please check the highlighted fields.", errors) };

  const child = {
    surname: d.surname, otherNames: d.otherNames, dateOfBirth: dob, gender: d.gender, previousSchool: d.previousSchool,
    parentName: d.parentName, relationship: d.relationship, parentPhone: phone!, parentEmail: d.parentEmail?.toLowerCase() || undefined, address: d.address,
    details: {
      currentClass: d.currentClass, nationality: d.nationality, stateOfOrigin: d.stateOfOrigin, religion: d.religion, languages: d.languages,
      occupation: d.occupation, otherParentName: d.otherParentName, otherParentPhone: d.otherParentPhone, health: d.health,
      ...(opts.declaration ? { declaredAt: new Date().toISOString() } : {}),
    },
  };
  return { valid: true as const, child, uploads };
}

const saveUploads = async (applicationId: string, uploads: Upload[]) => {
  for (const u of uploads) await saveDocument(applicationId, u.kind, u);
};

export async function submitApplicationAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (form.get("website")) return ok("Thank you."); // honeypot: only bots fill the hidden field
    const { ip } = await requestMeta();
    const key = `admission-apply:${ip}`;
    if (await isLocked(key)) return fail("Too many applications from this connection. Please wait a few minutes and try again.");
    const f = await readApplicationForm(form, { docsRequired: true, declaration: true });
    if (!f.valid) return f.result;
    await recordAttempt(key, false); // counts towards the per-connection limit (5 in 5 minutes)
    const r = await createApplication(f.child);
    await saveUploads(r.app.id, f.uploads);
    return ok(undefined, { redirect: r.link });
  });
}

/** The office registers a child (Secretary, Super Admin, Alpha). Documents can be added now or later. */
export async function registerApplicationAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const o = parseForm(z.object({
      windowId: zText(100, "Choose the admission session"), classId: z.string().optional(),
      fee: z.enum(["paid", "online", "waived"], { errorMap: () => ({ message: "Choose how the form fee is handled" }) }),
    }), form);
    const f = await readApplicationForm(form, { docsRequired: false, declaration: false });
    if (!f.valid) return f.result;
    const r = await createApplication({ ...f.child, classId: o.classId || undefined }, { windowId: o.windowId, fee: o.fee, by: staffName(v) });
    await saveUploads(r.app.id, f.uploads);
    await audit(await auditActor(v), "Registered applicant at the office", "Application", r.app.id, { number: r.app.number, fee: o.fee, documents: f.uploads.map((u) => u.kind) });
    return ok(`${r.app.otherNames.split(/\s+/)[0]} ${r.app.surname} registered (${r.app.number}).`, { redirect: `/admin/admissions/${r.app.id}?registered=1` });
  });
}

export async function payApplicationFeeAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const url = await startApplicationFee(String(form.get("number") ?? ""), String(form.get("token") ?? ""));
    return ok(undefined, { redirect: url });
  });
}

export async function uploadApplicationDocAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const app = await applicationByToken(String(form.get("number") ?? ""), String(form.get("token") ?? ""));
    if (!app) return fail("Application not found.");
    if (!["SUBMITTED", "EXAM_SCHEDULED"].includes(app.status)) return fail("Documents can't be changed on this application any more. Please contact the school office.");
    const kind = String(form.get("kind")) as DocKind;
    const doc = DOC_KINDS.find((k) => k.kind === kind);
    if (!doc) return fail("Choose a document.");
    const file = form.get("file") as File | null;
    const up = await readUpload(file, { allowPdf: kind !== "passport" });
    if ("error" in up) return fail(up.error!, { [`file-${kind}`]: up.error! });
    await saveDocument(app.id, kind, { buf: up.buf, mime: up.mime, ext: up.ext, name: file?.name ?? kind });
    return ok(`${docLabel(kind, (app.details as Record<string, string> | null)?.religion)} uploaded.`);
  });
}

export type ResultLookup = ActionResult & { result?: Awaited<ReturnType<typeof lookupResult>> | null; values?: { number: string; initial: string } };

export async function lookupResultAction(_: ResultLookup, form: FormData): Promise<ResultLookup> {
  const { ip } = await requestMeta();
  const key = `admission-result:${ip}`;
  if (await isLocked(key)) return { ok: false, message: "Too many tries. Please wait 5 minutes and try again.", values: { number: String(form.get("number") ?? ""), initial: String(form.get("initial") ?? "") } };
  const number = String(form.get("number") ?? "").trim();
  const initial = String(form.get("initial") ?? "").trim();
  const values = { number, initial }; // shown again in the form after it resets
  if (!number || !/^[a-zA-Z]$/.test(initial)) return { ok: false, values, fieldErrors: { ...(number ? {} : { number: "Enter the application number" }), ...(/^[a-zA-Z]$/.test(initial) ? {} : { initial: "One letter" }) } };
  const result = await lookupResult(number, initial);
  await recordAttempt(key, !!result);
  if (!result) return { ok: false, values, message: "We couldn't find that application. Check the number and the first letter of the child's surname." };
  return { ok: true, result, values };
}

// ---------- Back office ----------

const staffName = (v: { user: { firstName: string; lastName: string } }) => `${v.user.firstName} ${v.user.lastName}`;

/** Book the exam and tell the parent by SMS/email. Returns whether the message failed. */
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
    const op = String(form.get("op") ?? "");
    const actor = await auditActor(v);
    let done = 0;
    const problems: string[] = [];
    for (const id of ids) {
      const app = await db.application.findUnique({ where: { id }, select: { number: true } });
      if (!app) continue;
      try {
        if (op.startsWith("slot:")) {
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
    const what = op.startsWith("slot:") ? "booked for the exam" : "updated";
    return { ok: done > 0, message: `${done} application${done === 1 ? "" : "s"} ${what}.${problems.length ? ` Not done: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? ` and ${problems.length - 3} more` : ""}.` : ""}` };
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

/** Staff add or replace a document for the family. */
export async function staffUploadDocAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const app = await db.application.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
    const kind = String(form.get("kind")) as DocKind;
    if (!DOC_KINDS.some((k) => k.kind === kind)) return fail("Choose a document.");
    const file = form.get("file") as File | null;
    const up = await readUpload(file, { allowPdf: kind !== "passport" });
    if ("error" in up) return fail(up.error!, { [`file-${kind}`]: up.error! });
    await saveDocument(app.id, kind, { buf: up.buf, mime: up.mime, ext: up.ext, name: file?.name ?? kind });
    await audit(await auditActor(v), "Uploaded applicant document", "Application", app.id, { number: app.number, kind });
    return ok(`${docLabel(kind, (app.details as Record<string, string> | null)?.religion)} uploaded.`);
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
    const app = await decide(d.id, d.decision, d.note, v.user.id);
    await audit(await auditActor(v), "Recorded admission decision", "Application", app.id, { number: app.number, decision: d.decision });
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
