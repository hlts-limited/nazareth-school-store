// Runs against the throwaway test database: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { storage } from "../../src/shared/lib/storage";
import { admissionLetterPdf, applicationFormPdf, LetterNotReady } from "../../src/modules/admissions/letter";
import { UserError } from "../../src/shared/lib/action";
import {
  addExamSlot, admit, admissionNotice, applicationForDocLink, familyDocLink, changeParentPhone, correctChildDetails, admissionStatus, admittedList, applicationByToken, confirmApplicationFee, createApplication, decide, deleteApplication, enrol, enrolMany,
  lookupResult, markFeePaidAtOffice, renewAccessLink, saveDocument, saveWindow, setExamSlot, setResultsPublished, startApplicationFee, withdraw, type NewApplication,
} from "../../src/modules/admissions/service";

const DAY = 86_400_000;
let classId = "";
let staffId = "";
const RUN = Date.now().toString(36).toUpperCase(); // reg numbers stay unique across runs

// Born 4 March 2022: 5 on 31 December 2027, so Prep 2 for the 2027/2028 session
const child = (over: Partial<NewApplication> = {}): Omit<NewApplication, "classId"> & { classId?: string } => ({
  classId, surname: "Okonkwo", otherNames: "Ada Chioma", dateOfBirth: new Date("2022-03-04T00:00:00+01:00"), gender: "Female",
  parentName: "Ngozi Okonkwo", relationship: "Mother", parentPhone: "08039990001", address: "12 Test Close, Enugu",
  details: {}, ...over,
});

before(async () => {
  await db.applicationDocument.deleteMany();
  await db.application.deleteMany();
  await db.examSlot.deleteMany();
  await db.admissionWindow.deleteMany();
  classId = (await db.class.findFirstOrThrow({ where: { name: "Prep 2" } })).id;
  staffId = (await db.user.findFirstOrThrow({ where: { type: "STAFF" } })).id;
});

test("admission is closed when there is no window", async () => {
  const s = await admissionStatus();
  assert.equal(s.open, false);
  assert.match(admissionNotice(s), /currently closed/);
  await assert.rejects(createApplication(child()), UserError);
});

test("windows must close after they open and must not overlap", async () => {
  const now = Date.now();
  await assert.rejects(saveWindow(undefined, { session: "2027/2028", opensAt: new Date(now), closesAt: new Date(now - DAY), formFee: 0 }), /closing date/);
  await saveWindow(undefined, { session: "2027/2028", opensAt: new Date(now - DAY), closesAt: new Date(now + 30 * DAY), formFee: 5000 });
  await assert.rejects(saveWindow(undefined, { session: "2028/2029", opensAt: new Date(now + 10 * DAY), closesAt: new Date(now + 60 * DAY), formFee: 0 }), /overlap/);
});

test("the notice gives the last open day, not the closing instant", async () => {
  const s = await admissionStatus();
  assert.equal(s.open, true);
  const w = s.window!;
  await db.admissionWindow.update({ where: { id: w.id }, data: { closesAt: new Date("2027-01-01T00:00:00+01:00") } });
  assert.match(admissionNotice(await admissionStatus(new Date("2026-12-01T12:00:00Z"))), /open until Thursday, 31 December 2026/);
  await db.admissionWindow.update({ where: { id: w.id }, data: { closesAt: w.closesAt } });
});

test("the class is chosen by age, and Primary 6 ages are turned away", async () => {
  const other = (await db.class.findFirstOrThrow({ where: { name: "Primary 3" } })).id;
  const { app } = await createApplication(child({ classId: other, parentPhone: "08039990050" }));
  assert.equal(app.classId, classId, "the website ignores any class sent with the form");
  await db.application.delete({ where: { id: app.id } });
  const k = await createApplication(child({ dateOfBirth: new Date("2025-08-20T00:00:00+01:00"), parentPhone: "08039990051" }));
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: k.app.classId } })).name, "Kindergarten");
  await db.application.delete({ where: { id: k.app.id } });
  await assert.rejects(createApplication(child({ dateOfBirth: new Date("2016-05-01T00:00:00+01:00") })), /Primary 6/);
  await assert.rejects(createApplication(child({ dateOfBirth: new Date("2026-01-01T00:00:00+01:00") })), /at least 2/);
});

test("full journey: apply, pay the form fee, exam, decision, results, enrol", async () => {
  const { app, token } = await createApplication(child());
  assert.match(app.number, /^NZA27-[2-9A-HJKMNP-Z]{6}$/);
  assert.equal(app.classId, classId);
  assert.equal(app.status, "AWAITING_PAYMENT");
  assert.equal(app.feeAmount, 5000);

  // The private link needs the right token
  assert.ok(await applicationByToken(app.number.toLowerCase(), token));
  assert.equal(await applicationByToken(app.number, token + "x"), null);
  assert.equal(await applicationByToken(app.number, ""), null);

  // Unpaid applications don't show in the results lookup
  assert.equal(await lookupResult(app.number, "O"), null);

  // Simulated Paystack: paying twice only counts once
  await startApplicationFee(app.number, token);
  const ref = (await db.application.findUniqueOrThrow({ where: { id: app.id } })).feeRef!;
  assert.ok(ref.startsWith(app.number));
  assert.equal(await confirmApplicationFee(ref), "paid");
  assert.equal(await confirmApplicationFee(ref), "already");
  assert.equal(await confirmApplicationFee("NZA-nonsense"), "failed");
  await assert.rejects(startApplicationFee(app.number, token), /already paid/);

  // Form fee can't change once families have paid it
  const w = await db.admissionWindow.findUniqueOrThrow({ where: { id: app.windowId } });
  await assert.rejects(saveWindow(w.id, { session: w.session, opensAt: w.opensAt, closesAt: w.closesAt, formFee: 7000 }), /can't be changed/);

  // Exam slot with room for one
  const slot = await addExamSlot(app.windowId, { startsAt: new Date(Date.now() + 7 * DAY), venue: "Hall A", capacity: 1 });
  assert.equal((await setExamSlot(app.id, slot.id)).status, "EXAM_SCHEDULED");

  // Lookup: surname initial must match; no outcome until results are published
  assert.equal(await lookupResult(app.number, "X"), null);
  const pending = await lookupResult(` ${app.number.toLowerCase()} `, "o");
  assert.equal(pending?.firstName, "Ada");
  assert.equal(pending?.outcome, null);
  assert.equal(pending?.exam?.venue, "Hall A");

  await decide(app.id, "ADMITTED", "Strong reading", staffId);
  assert.equal((await lookupResult(app.number, "O"))?.outcome, null, "hidden until published");
  await setResultsPublished(app.windowId, true);
  assert.equal((await lookupResult(app.number, "O"))?.outcome, "ADMITTED");

  // Enrolment creates the pupil and links (or invites) the parent
  const r = await enrol(app.id, { regNumber: `NAZ/T${RUN}/1`, classId });
  assert.equal(r.pupil.lastName, "Okonkwo");
  assert.equal(r.parent.phone, "08039990001");
  const done = await db.application.findUniqueOrThrow({ where: { id: app.id } });
  assert.equal(done.status, "ENROLLED");
  assert.equal(done.pupilId, r.pupil.id);
  assert.equal((await lookupResult(app.number, "O"))?.outcome, "ADMITTED", "enrolled still reads as admitted");

  // Enrolled children can't be withdrawn or re-decided
  await assert.rejects(withdraw(app.id), /already enrolled/);
  await assert.rejects(decide(app.id, "NOT_ADMITTED", undefined, staffId), UserError);
  await assert.rejects(enrol(app.id, { regNumber: `NAZ/T${RUN}/2`, classId }), /Only admitted/);
});

test("exam slots respect capacity and unpaid forms can't be decided", async () => {
  const s = await admissionStatus();
  const slot = await db.examSlot.findFirstOrThrow({ where: { windowId: s.window!.id } });
  // Slot is still held by the enrolled child above, so it's full
  const { app, token } = await createApplication(child({ surname: "Bello", otherNames: "Tunde", parentPhone: "08039990002" }));
  await assert.rejects(decide(app.id, "ADMITTED", undefined, staffId), /form fee unpaid/);
  await startApplicationFee(app.number, token);
  await confirmApplicationFee((await db.application.findUniqueOrThrow({ where: { id: app.id } })).feeRef!);
  await assert.rejects(setExamSlot(app.id, slot.id), /full/);

  const w = await withdraw(app.id);
  assert.equal(w.status, "WITHDRAWN");
  assert.equal((await lookupResult(app.number, "B"))?.outcome, "WITHDRAWN");
});

test("free windows submit straight away", async () => {
  const s = await admissionStatus();
  await db.admissionWindow.update({ where: { id: s.window!.id }, data: { formFee: 0 } });
  const { app } = await createApplication(child({ surname: "Eze", otherNames: "Chidi", parentPhone: "08039990003" }));
  assert.equal(app.status, "SUBMITTED");
  assert.ok(app.submittedAt);
});

test("the office registers a child: fee handling and class override", async () => {
  const s = await admissionStatus();
  await db.admissionWindow.update({ where: { id: s.window!.id }, data: { formFee: 3000 } });
  const by = "Joy Nnamdi";
  const paid = await createApplication(child({ surname: "Adeyemi", parentPhone: "08039990060" }), { windowId: s.window!.id, fee: "paid", by });
  assert.equal(paid.app.status, "SUBMITTED");
  assert.ok(paid.app.feePaidAt);
  assert.equal(paid.app.feeAmount, 3000);
  assert.equal((paid.app.details as Record<string, string>).registeredBy, by);

  const online = await createApplication(child({ surname: "Obi", parentPhone: "08039990061" }), { windowId: s.window!.id, fee: "online", by });
  assert.equal(online.app.status, "AWAITING_PAYMENT");

  const p3 = (await db.class.findFirstOrThrow({ where: { name: "Primary 3" } })).id;
  const waived = await createApplication(child({ surname: "Uche", parentPhone: "08039990062", classId: p3 }), { windowId: s.window!.id, fee: "waived", by });
  assert.equal(waived.app.status, "SUBMITTED");
  assert.equal(waived.app.feeAmount, 0);
  assert.equal(waived.app.classId, p3, "staff can choose another class");
});

test("the office can record a form fee paid in person", async () => {
  const s = await admissionStatus();
  await db.admissionWindow.update({ where: { id: s.window!.id }, data: { formFee: 3800 } });
  const { app } = await createApplication(child({ surname: "Office", parentPhone: "08039990090" }));
  assert.equal(app.status, "AWAITING_PAYMENT");
  const paid = await markFeePaidAtOffice(app.id, "Joy Nnamdi");
  assert.equal(paid.status, "SUBMITTED");
  assert.ok(paid.feePaidAt && paid.submittedAt);
  assert.equal((paid.details as Record<string, string>).feePaidAtOffice, "Joy Nnamdi");
  await assert.rejects(markFeePaidAtOffice(app.id, "Joy Nnamdi"), /already settled/);
});

test("a new family link replaces the old one", async () => {
  const { app, token } = await createApplication(child({ surname: "Link", parentPhone: "08039990070" }));
  const { link } = await renewAccessLink(app.id);
  const fresh = link.split("/").pop()!;
  assert.equal(await applicationByToken(app.number, token), null, "old link stops working");
  assert.ok(await applicationByToken(app.number, fresh));
});

test("admitted children move into the class they applied for, with new reg numbers", async () => {
  const s = await admissionStatus();
  const a = await createApplication(child({ surname: "Move", otherNames: "Amaka", parentPhone: "08039990080" }), { windowId: s.window!.id, fee: "waived", by: "Test" });
  // No class sent: the office form then uses the class by age, like the website
  const b = await createApplication(child({ surname: "Move", otherNames: "Bayo", parentPhone: "08039990080", dateOfBirth: new Date("2019-02-01T00:00:00+01:00"), classId: undefined }), { windowId: s.window!.id, fee: "waived", by: "Test" });
  const c = await createApplication(child({ surname: "Stay", parentPhone: "08039990081" }), { windowId: s.window!.id, fee: "waived", by: "Test" });
  await decide(a.app.id, "ADMITTED", undefined, staffId);
  await decide(b.app.id, "ADMITTED", undefined, staffId);
  const list = await admittedList(s.window!.id);
  assert.ok(list.waiting.some((x) => x.id === a.app.id) && list.waiting.some((x) => x.id === b.app.id));
  assert.ok(!list.waiting.some((x) => x.id === c.app.id), "not admitted: not listed");

  const r = await enrolMany([a.app.id, b.app.id, c.app.id]);
  assert.equal(r.done.length, 2);
  assert.equal(r.failed.length, 1, "the child who wasn't admitted is refused");
  const pa = await db.pupil.findUniqueOrThrow({ where: { id: (await db.application.findUniqueOrThrow({ where: { id: a.app.id } })).pupilId! }, include: { class: true, guardians: true } });
  const pb = await db.pupil.findUniqueOrThrow({ where: { id: (await db.application.findUniqueOrThrow({ where: { id: b.app.id } })).pupilId! }, include: { class: true, guardians: true } });
  assert.equal(pa.class.name, "Prep 2");
  assert.equal(pb.class.name, "Primary 3", "born Feb 2019: 8 on 31 Dec 2027");
  assert.notEqual(pa.regNumber, pb.regNumber);
  assert.equal(pa.guardians[0].parentId, pb.guardians[0].parentId, "brother and sister share one parent account");
});

test("passed: admit puts the child straight into their class for the School Store", async () => {
  const s = await admissionStatus();
  const { app } = await createApplication(child({ surname: "Straight", otherNames: "Ife", parentPhone: "08039990085" }), { windowId: s.window!.id, fee: "waived", by: "Test" });
  const r = await admit(app.id, "Strong in maths", staffId);
  assert.ok(r.pupil, r.problem ?? "no pupil");
  const after = await db.application.findUniqueOrThrow({ where: { id: app.id }, include: { pupil: { include: { class: true, guardians: { include: { parent: true } } } } } });
  assert.equal(after.status, "ENROLLED");
  assert.equal(after.decisionNote, "Strong in maths");
  assert.equal(after.pupil!.class.name, "Prep 2");
  assert.equal(after.pupil!.guardians[0].parent.phone, "08039990085", "linked to the parent so they can shop");
  assert.ok(!(await admittedList(s.window!.id)).waiting.some((x) => x.id === app.id), "nothing left to move");
});

test("deleting an application removes it and its documents, and keeps any pupil", async () => {
  const s = await admissionStatus();
  const { app } = await createApplication(child({ surname: "Gone", parentPhone: "08039990086" }), { windowId: s.window!.id, fee: "waived", by: "Test" });
  await saveDocument(app.id, "birth", { buf: Buffer.from("%PDF-1.4 test"), mime: "application/pdf", ext: "pdf", name: "birth.pdf" });
  const doc = await db.applicationDocument.findFirstOrThrow({ where: { applicationId: app.id } });
  assert.ok(await storage().get(doc.fileKey));
  await deleteApplication(app.id);
  assert.equal(await db.application.findUnique({ where: { id: app.id } }), null);
  assert.equal(await db.applicationDocument.count({ where: { applicationId: app.id } }), 0);
  assert.equal(await storage().get(doc.fileKey).catch(() => null), null, "file removed from storage");

  const kept = await createApplication(child({ surname: "Kept", parentPhone: "08039990087" }), { windowId: s.window!.id, fee: "waived", by: "Test" });
  const r = await admit(kept.app.id, undefined, staffId);
  const gone = await deleteApplication(kept.app.id);
  assert.equal(gone.pupil?.id, r.pupil!.id);
  assert.ok(await db.pupil.findUnique({ where: { id: r.pupil!.id } }), "the pupil stays");
});

test("the admission letter is only for admitted children, after results are published", async () => {
  const s = await admissionStatus();
  const w = s.window!;
  await setResultsPublished(w.id, false);
  const { app } = await createApplication(child({ surname: "Letter", otherNames: "Tolu", parentPhone: "08039990088" }), { windowId: w.id, fee: "waived", by: "Test" });
  await assert.rejects(admissionLetterPdf(app.id), LetterNotReady, "not admitted yet");
  await admit(app.id, undefined, staffId);
  await assert.rejects(admissionLetterPdf(app.id), LetterNotReady, "results not published yet");
  await setResultsPublished(w.id, true);
  const pdf = await admissionLetterPdf(app.id);
  assert.equal(pdf.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal(pdf.name, `admission-letter-${app.number}.pdf`);
  await setResultsPublished(w.id, false);
});

test("the office corrects a name or date of birth only with an affidavit, and the class follows the new age", async () => {
  const s = await admissionStatus();
  const { app } = await createApplication(child({ surname: "Fix", otherNames: "Chika", parentPhone: "08039990089" }), { windowId: s.window!.id, fee: "waived", by: "Test" });
  const aff = { buf: Buffer.from("%PDF-1.4 affidavit"), mime: "application/pdf", ext: "pdf", name: "affidavit.pdf" };
  await assert.rejects(correctChildDetails(app.id, { surname: "Fix", otherNames: "Chika", dateOfBirth: app.dateOfBirth }, aff, "Joy"), /Nothing has changed/);
  await assert.rejects(correctChildDetails(app.id, { surname: "Fixed", otherNames: "Chika", dateOfBirth: app.dateOfBirth }, null, "Joy"), /affidavit/);

  // Born Feb 2019: 8 on 31 December 2027, so Primary 3 instead of Prep 2
  const r = await correctChildDetails(app.id, { surname: "Fixed", otherNames: "Chika Ada", dateOfBirth: new Date("2019-02-01T00:00:00+01:00") }, aff, "Joy");
  assert.equal(r.app.surname, "Fixed");
  assert.equal(r.correction.from.dateOfBirth, "2022-03-04");
  assert.equal(r.correction.to.dateOfBirth, "2019-02-01");
  assert.equal(r.correction.classTo, "Primary 3");
  const after = await db.application.findUniqueOrThrow({ where: { id: app.id }, include: { class: true, documents: true } });
  assert.equal(after.class.name, "Primary 3");
  assert.ok(after.documents.some((d) => d.kind === "affidavit-1"), "the affidavit is kept with the application");
  const second = await correctChildDetails(app.id, { surname: "Fixed", otherNames: "Chika", dateOfBirth: after.dateOfBirth }, aff, "Joy");
  assert.equal(second.correction.affidavit, "affidavit-2", "each change keeps its own affidavit");
  assert.equal(((await db.application.findUniqueOrThrow({ where: { id: app.id } })).details as { corrections: unknown[] }).corrections.length, 2);

  await assert.rejects(changeParentPhone(app.id, "08039990089"), /already/);
  assert.equal((await changeParentPhone(app.id, "08039990099")).app.parentPhone, "08039990099");

  const form = await applicationFormPdf(app.id);
  assert.equal(form.bytes.subarray(0, 5).toString(), "%PDF-");
});

test("results-page document links work only as issued and expire", async () => {
  const { app } = await createApplication(child({ surname: "Link", otherNames: "Doc", parentPhone: "08039990091" }));
  const q = (href: string) => Object.fromEntries(new URL(href, "http://x").searchParams) as Record<string, string>;
  const link = q(familyDocLink(app.number, "letter"));
  assert.equal((await applicationForDocLink(link))?.app.id, app.id);
  assert.equal(await applicationForDocLink({ ...link, doc: "form" }), null, "can't swap the document");
  assert.equal(await applicationForDocLink({ ...link, n: "NZA27-ZZZZZZ" }), null, "can't swap the application");
  assert.equal(await applicationForDocLink({ ...link, exp: String(Number(link.exp) + 3600) }), null, "can't extend it");
  assert.equal(await applicationForDocLink({ ...link, exp: "1000" }), null);
});

test("application numbers are unique", async () => {
  const numbers = new Set<string>();
  for (let i = 0; i < 20; i++) numbers.add((await createApplication(child({ parentPhone: `0803999${String(1000 + i)}` }))).app.number);
  assert.equal(numbers.size, 20);
});
