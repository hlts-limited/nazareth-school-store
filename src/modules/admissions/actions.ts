"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zInt, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { db } from "@/shared/lib/db";
import { normalizePhone } from "@/shared/lib/format";
import { requestMeta } from "@/shared/lib/request";
import { readUpload } from "@/shared/lib/storage";
import { auditActor, isLocked, recordAttempt, staffFor } from "@/modules/auth";
import { audit } from "@/modules/audit";
import {
  addExamSlot, applicationByToken, createApplication, decide, deleteExamSlot, DOC_KINDS, enrol, lookupResult, saveDocument,
  saveWindow, setExamSlot, setResultsPublished, startApplicationFee, withdraw, type DocKind,
} from "./service";

const zDay = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const zDateTime = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, msg);
const lagos = (local: string) => new Date(`${local.length === 10 ? `${local}T00:00` : local}:00+01:00`);

// ---------- Public: apply, pay, upload, check result ----------

export async function submitApplicationAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (form.get("website")) return ok("Thank you."); // honeypot: only bots fill the hidden field
    const { ip } = await requestMeta();
    const key = `admission-apply:${ip}`;
    if (await isLocked(key)) return fail("Too many applications from this connection. Please wait a few minutes and try again.");
    const d = parseForm(z.object({
      classId: zText(100, "Choose a class"),
      surname: zText(80, "Enter the child's surname"), otherNames: zText(120, "Enter the child's other names"),
      dateOfBirth: zDay("Enter the date of birth"), gender: z.enum(["Female", "Male"], { errorMap: () => ({ message: "Choose the gender" }) }),
      previousSchool: zOptText(160), currentClass: zOptText(60),
      nationality: zOptText(60), stateOfOrigin: zOptText(60), religion: zOptText(60), languages: zOptText(120),
      parentName: zText(120, "Enter the parent's full name"), relationship: zText(40, "Choose your relationship to the child"),
      parentPhone: zText(20, "Enter a phone number"), parentEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
      occupation: zOptText(80), address: zText(300, "Enter your home address"),
      otherParentName: zOptText(120), otherParentPhone: zOptText(20),
      health: zOptText(600),
      declaration: z.literal("on", { errorMap: () => ({ message: "Please confirm the declaration" }) }),
    }), form);
    const phone = normalizePhone(d.parentPhone);
    if (!phone) return fail("Please check the highlighted fields.", { parentPhone: "Enter a valid Nigerian phone number, e.g. 08031234567" });
    const dob = lagos(d.dateOfBirth);
    const age = (Date.now() - dob.getTime()) / (365.25 * 86400_000);
    if (age < 1 || age > 16) return fail("Please check the highlighted fields.", { dateOfBirth: "Check the date of birth" });

    await recordAttempt(key, false); // counts towards the per-connection limit (5 in 5 minutes)
    const r = await createApplication({
      classId: d.classId, surname: d.surname, otherNames: d.otherNames, dateOfBirth: dob, gender: d.gender, previousSchool: d.previousSchool,
      parentName: d.parentName, relationship: d.relationship, parentPhone: phone, parentEmail: d.parentEmail?.toLowerCase() || undefined, address: d.address,
      details: {
        currentClass: d.currentClass, nationality: d.nationality, stateOfOrigin: d.stateOfOrigin, religion: d.religion, languages: d.languages,
        occupation: d.occupation, otherParentName: d.otherParentName, otherParentPhone: d.otherParentPhone, health: d.health,
        declaredAt: new Date().toISOString(),
      },
    });
    return ok(undefined, { redirect: r.link });
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
    return ok(`${doc.label} uploaded.`);
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

export async function setExamSlotAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("admissions.manage");
    const d = parseForm(z.object({ id: zText(100), slotId: z.string().optional() }), form);
    const app = await setExamSlot(d.id, d.slotId || null);
    await audit(await auditActor(v), app.examSlot ? "Scheduled entrance exam" : "Removed exam slot", "Application", app.id, { number: app.number, slot: app.examSlot?.startsAt.toISOString() });
    return ok(app.examSlot ? "Exam slot saved. The family sees it on their application page." : "Exam slot removed.");
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
