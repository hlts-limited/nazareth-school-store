// Runs against the throwaway test database: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import { storage } from "../../src/shared/lib/storage";
import { registerStaff } from "../../src/modules/hr/service";
import {
  acceptNotice, addHoliday, closeDay, completeCapture, currentGateCode, dayValue, decideLeave, gateCodeValid, lagosDate, manualClock, metresBetween, monthTotals,
  purgeOldPhotos, requestLeave, saveAttendanceSettings, startCapture,
} from "../../src/modules/attendance/service";

const RUN = Date.now().toString(36);
let n = 0;
const photo = { buf: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), mime: "image/jpeg", ext: "jpg" };
const SCHOOL = { lat: 6.4654, lng: 3.2836 };
let hr = { userId: "", name: "Joy Nnamdi" };

async function newStaff(consent = true) {
  n++;
  const { employee } = await registerStaff({
    firstName: "Ada", lastName: `Clock${n}`, email: `clock${n}.${RUN}@example.com`, section: "school-b", branch: "school-b", position: "Teacher", isTeacher: true,
    hireDate: new Date("2026-01-05T00:00:00Z"), employmentType: "FULL_TIME", monthlyGrossKobo: 100_000_00, annualRentNaira: 0,
  });
  if (consent) await acceptNotice(employee.id);
  return employee;
}

before(async () => {
  await db.captureToken.deleteMany();
  await db.attendance.deleteMany();
  await db.leaveRequest.deleteMany();
  await db.holiday.deleteMany();
  await db.setting.deleteMany({ where: { key: "attendance" } });
  hr = { userId: (await db.user.findFirstOrThrow({ where: { email: "office@example.com" } })).id, name: "Joy Nnamdi" };
});

test("the rotating gate code is good for its 30 seconds and the next 30, and can't be forged", async () => {
  await saveAttendanceSettings({ qrMode: "rotating" });
  const t = Date.UTC(2026, 9, 19, 7, 0, 5);
  const { code, secondsLeft } = await currentGateCode(t);
  assert.ok(secondsLeft! > 0 && secondsLeft! <= 30);
  assert.equal(await gateCodeValid(code, t), true);
  assert.equal(await gateCodeValid(code, t + 30_000), true, "still fine in the next window");
  assert.equal(await gateCodeValid(code, t + 65_000), false, "a photo of the code is useless a minute later");
  assert.equal(await gateCodeValid(code.slice(0, -2) + "xx", t), false);
  assert.equal(await gateCodeValid("hello", t), false);
});

test("a printed code works only in printed mode, and stops when codes are replaced", async () => {
  await saveAttendanceSettings({ qrMode: "static", qrVersion: 3 });
  const { code } = await currentGateCode();
  assert.equal(await gateCodeValid(code), true);
  await saveAttendanceSettings({ qrVersion: 4 });
  assert.equal(await gateCodeValid(code), false);
  await saveAttendanceSettings({ qrMode: "rotating", qrVersion: 1 });
  assert.equal(await gateCodeValid((await currentGateCode()).code), true);
});

test("clocking in: consent first, then a 60-second single-use token, a photo, and the late cutoff", async () => {
  await saveAttendanceSettings({ qrMode: "rotating", photoRequired: true, gps: null, lateCutoff: "07:45" });
  const noConsent = await newStaff(false);
  await assert.rejects(startCapture(noConsent.id, (await currentGateCode()).code), /notice/);

  const e = await newStaff();
  await assert.rejects(startCapture(e.id, "NZQ1.r.1.bad"), /current gate code/);
  // 07:50 Lagos is late
  const at = new Date(`${lagosDate()}T07:50:00+01:00`);
  const s = await startCapture(e.id, (await currentGateCode(at.getTime())).code, at);
  assert.equal(s.kind, "in");
  await assert.rejects(completeCapture(e.id, s.token, null, null, at), /photo/);
  const other = await newStaff();
  await assert.rejects(completeCapture(other.id, s.token, photo, null, at), /too long|already used/, "someone else's token is refused");
  await assert.rejects(completeCapture(e.id, s.token, photo, null, new Date(at.getTime() + 61_000)), /too long/, "expired");
  const s2 = await startCapture(e.id, (await currentGateCode(at.getTime())).code, at);
  const r = await completeCapture(e.id, s2.token, photo, null, at);
  assert.equal(r.kind, "in");
  assert.equal(r.record.status, "LATE");
  assert.ok(r.record.inPhotoKey && (await storage().get(r.record.inPhotoKey)), "photo stored");
  await assert.rejects(completeCapture(e.id, s2.token, photo, null, at), /already used|too long/, "a token works once");
  // Next scan clocks out
  const later = new Date(`${lagosDate()}T15:30:00+01:00`);
  const s3 = await startCapture(e.id, (await currentGateCode(later.getTime())).code, later);
  assert.equal(s3.kind, "out");
  const out = await completeCapture(e.id, s3.token, photo, null, later);
  assert.ok(out.record.clockOutAt);
  await assert.rejects(startCapture(e.id, (await currentGateCode(later.getTime())).code, later), /already clocked in and out/);
});

test("with a school location set, a phone outside the radius is refused", async () => {
  await saveAttendanceSettings({ gps: { ...SCHOOL, radiusM: 150 }, photoRequired: false });
  assert.ok(metresBetween(SCHOOL, { lat: 6.4664, lng: 3.2836 }) > 100);
  const e = await newStaff();
  const at = new Date(`${lagosDate()}T07:30:00+01:00`);
  const a = await startCapture(e.id, (await currentGateCode(at.getTime())).code, at);
  await assert.rejects(completeCapture(e.id, a.token, null, null, at), /location/);
  const b = await startCapture(e.id, (await currentGateCode(at.getTime())).code, at);
  await assert.rejects(completeCapture(e.id, b.token, null, { lat: 6.48, lng: 3.29 }, at), /from the school/);
  const c = await startCapture(e.id, (await currentGateCode(at.getTime())).code, at);
  const r = await completeCapture(e.id, c.token, null, { lat: 6.4655, lng: 3.2837 }, at);
  assert.equal(r.record.status, "PRESENT");
  await saveAttendanceSettings({ gps: null, photoRequired: true });
});

test("branches: staff clock in at the branch they're deployed to; no branch set means any branch", async () => {
  const A = { id: "school-a", name: "School A", lat: 6.4654, lng: 3.2836, radiusM: 150 };
  const B = { id: "school-b", name: "School B", lat: 6.4760, lng: 3.2950, radiusM: 150 };
  await saveAttendanceSettings({ branches: [A, B], gps: null, photoRequired: false });
  const at = new Date(`${lagosDate()}T07:30:00+01:00`);
  const scan = async (id: string) => (await startCapture(id, (await currentGateCode(at.getTime())).code, at)).token;

  const e = await newStaff(); // deployed to School B
  await assert.rejects(completeCapture(e.id, await scan(e.id), null, { lat: A.lat, lng: A.lng }, at), /deployed to School B/, "at another branch's gate is refused");
  const ok = await completeCapture(e.id, await scan(e.id), null, { lat: B.lat + 0.0003, lng: B.lng }, at);
  assert.equal(ok.at, "School B");

  const unset = await newStaff();
  await db.employee.update({ where: { id: unset.id }, data: { branch: null } });
  const anyOk = await completeCapture(unset.id, await scan(unset.id), null, { lat: A.lat, lng: A.lng }, at);
  assert.equal(anyOk.at, "School A", "until HR sets a branch, any branch is accepted");
  await saveAttendanceSettings({ branches: [], photoRequired: true });
});

test("manual clock needs a reason and a past time", async () => {
  const e = await newStaff();
  const day = "2026-10-12";
  await assert.rejects(manualClock(e.id, "out", day, "15:00", "phone", hr.name), /Clock them in first/);
  await assert.rejects(manualClock(e.id, "in", day, "07:30", " ", hr.name), /reason/);
  const r = await manualClock(e.id, "in", day, "08:10", "Phone camera broken", hr.name);
  assert.equal(r.status, "LATE");
  assert.match(r.manualNote!, /Phone camera broken/);
});

test("close day: absent unless on approved leave or a holiday; approving leave later turns absence into leave", async () => {
  const day = "2026-10-13"; // a Tuesday
  const here = await newStaff(), away = await newStaff(), sick = await newStaff();
  await manualClock(here.id, "in", day, "07:30", "test", hr.name);
  const lr = await requestLeave(sick.id, { type: "sick", from: day, to: day });
  await decideLeave(lr.id, true, undefined, hr);
  const r = await closeDay(day);
  assert.ok(r.absent >= 1);
  const rec = async (id: string) => (await db.attendance.findUniqueOrThrow({ where: { employeeId_date: { employeeId: id, date: dayValue(day) } } })).status;
  assert.equal(await rec(away.id), "ABSENT");
  assert.equal(await rec(sick.id), "LEAVE");
  assert.equal(await rec(here.id), "PRESENT");
  // Leave approved after the day was closed
  const late = await requestLeave(away.id, { type: "compassionate", from: day, to: day });
  await assert.rejects(decideLeave(late.id, true, undefined, { userId: away.userId, name: "x" }), /your own/);
  await decideLeave(late.id, true, undefined, hr);
  assert.equal(await rec(away.id), "LEAVE");
  await assert.rejects(closeDay("2026-10-17"), /school day/, "Saturday");
  await addHoliday("2026-10-01", "Independence Day");
  const h = await closeDay("2026-10-01");
  assert.equal(h.holidayName, "Independence Day");
  await assert.rejects(requestLeave(sick.id, { type: "sick", from: day, to: day }), /already have leave/);
});

test("photos older than 31 days are deleted; the record and its times stay; totals feed payroll", async () => {
  const e = await newStaff();
  const old = "2026-08-03";
  const key = `attendance/${old}/${e.id}-in-test.jpg`;
  await storage().put(key, photo.buf, photo.mime);
  await db.attendance.create({ data: { employeeId: e.id, date: dayValue(old), status: "LATE", clockInAt: new Date(`${old}T08:00:00+01:00`), inPhotoKey: key } });
  const r = await purgeOldPhotos(new Date("2026-10-19T01:00:00Z"));
  assert.ok(r.deleted >= 1);
  assert.equal(await storage().get(key), null, "photo gone");
  const row = await db.attendance.findUniqueOrThrow({ where: { employeeId_date: { employeeId: e.id, date: dayValue(old) } } });
  assert.equal(row.inPhotoKey, null);
  assert.ok(row.photoDeletedAt && row.clockInAt, "the record and time stay");
  const t = await monthTotals("2026-08");
  assert.equal(t.get(e.id)?.LATE, 1);
});
