// Runs against the throwaway test database: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { UserError } from "../../src/shared/lib/action";
import {
  addExamSlot, admissionNotice, admissionStatus, applicationByToken, confirmApplicationFee, createApplication, decide, enrol,
  lookupResult, saveWindow, setExamSlot, setResultsPublished, startApplicationFee, withdraw, type NewApplication,
} from "../../src/modules/admissions/service";

const DAY = 86_400_000;
let classId = "";
let staffId = "";
const RUN = Date.now().toString(36).toUpperCase(); // reg numbers stay unique across runs

const child = (over: Partial<NewApplication> = {}): NewApplication => ({
  classId, surname: "Okonkwo", otherNames: "Ada Chioma", dateOfBirth: new Date("2021-03-04"), gender: "Female",
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

test("full journey: apply, pay the form fee, exam, decision, results, enrol", async () => {
  const { app, token } = await createApplication(child());
  assert.match(app.number, /^NZA27-[2-9A-HJKMNP-Z]{6}$/);
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

test("application numbers are unique", async () => {
  const numbers = new Set<string>();
  for (let i = 0; i < 20; i++) numbers.add((await createApplication(child({ parentPhone: `0803999${String(1000 + i)}` }))).app.number);
  assert.equal(numbers.size, 20);
});
