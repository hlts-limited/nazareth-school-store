// Runs against the throwaway test database: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/shared/lib/db";
import {
  bankInClear, employeeDetail, onboarding, registerStaff, reviewBank, reviewStaffDocument, saveStaffDocument, setBankDetails, setEmployeeStatus,
  type EmployeeInput,
} from "../../src/modules/hr/service";

const RUN = Date.now().toString(36);
let hrId = "";
const person = (n: number, over: Partial<EmployeeInput> = {}): EmployeeInput => ({
  firstName: "Grace", lastName: `Teacher${n}`, email: `t${n}.${RUN}@example.com`, phone: `0809000${String(1000 + n).slice(-4)}`,
  section: "school-a", position: "Class Teacher", isTeacher: true, hireDate: new Date("2026-09-01T00:00:00Z"), employmentType: "FULL_TIME",
  monthlyGrossKobo: 100_000_00, annualRentNaira: 0, ...over,
});
const pdf = { buf: Buffer.from("%PDF-1.4 test"), mime: "application/pdf", ext: "pdf", name: "doc.pdf" };
const jpg = { buf: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), mime: "image/jpeg", ext: "jpg", name: "photo.jpg" };

before(async () => {
  await db.payrollItem.deleteMany(); await db.payrollRun.deleteMany(); await db.payrollAdjustment.deleteMany();
  await db.employeeDocument.deleteMany();
  await db.employee.deleteMany();
  hrId = (await db.user.findFirstOrThrow({ where: { type: "STAFF", email: "office@example.com" } })).id;
});

test("registering staff gives a staff code, the Staff role and an invite; codes count up", async () => {
  const a = await registerStaff(person(1), ["head"]);
  const b = await registerStaff(person(2));
  assert.equal(a.invited, true);
  assert.match(a.employee.staffCode, /^NS-\d{3}$/);
  assert.equal(Number(b.employee.staffCode.slice(3)), Number(a.employee.staffCode.slice(3)) + 1);
  const u = await db.user.findUniqueOrThrow({ where: { id: a.employee.userId }, include: { roles: true } });
  assert.deepEqual(u.roles.map((r) => r.roleId).sort(), ["head", "staff"]);
  assert.equal(u.status, "INVITED");
  assert.ok(u.inviteToken, "a set-up link exists");
  assert.equal(u.totpSecret, null, "teachers don't need two-step sign-in");
  await assert.rejects(registerStaff(person(1)), /already has a staff record/);
});

test("an existing back-office account is linked, not invited again", async () => {
  const office = await db.user.findFirstOrThrow({ where: { email: "store@example.com" } });
  const r = await registerStaff(person(3, { email: "store@example.com", position: "Registrar", isTeacher: false, section: "admin" }));
  assert.equal(r.invited, false);
  assert.equal(r.employee.userId, office.id);
});

test("documents: HR reviews them, never their own; a rejection needs a reason; one-of-a-kind documents replace", async () => {
  const { employee } = await registerStaff(person(4));
  const cv = await saveStaffDocument(employee.id, "cv", pdf, { by: employee.userId, hr: false });
  await assert.rejects(reviewStaffDocument(cv.id, false, undefined, hrId), /Say what's wrong/);
  await assert.rejects(reviewStaffDocument(cv.id, true, undefined, employee.userId), /your own/);
  const again = await saveStaffDocument(employee.id, "cv", pdf, { by: employee.userId, hr: false });
  assert.equal(await db.employeeDocument.count({ where: { employeeId: employee.id, kind: "cv" } }), 1, "the new CV replaced the old");
  await saveStaffDocument(employee.id, "certificate", pdf, { by: employee.userId, hr: false });
  await saveStaffDocument(employee.id, "certificate", pdf, { by: employee.userId, hr: false });
  assert.equal(await db.employeeDocument.count({ where: { employeeId: employee.id, kind: "certificate" } }), 2, "certificates add up");
  const r = await reviewStaffDocument(again.id, false, "Blurred, please rescan", hrId);
  assert.equal(r.doc.status, "REJECTED");
  const contract = await saveStaffDocument(employee.id, "contract", pdf, { by: hrId, hr: true });
  assert.equal(contract.status, "APPROVED", "HR's own contract upload needs no review");
  await assert.rejects(saveStaffDocument(employee.id, "contract", pdf, { by: employee.userId, hr: false }), /Only HR/);
});

test("bank details are encrypted, checked with Paystack (test mode), and verified by someone else", async () => {
  const { employee } = await registerStaff(person(5));
  const r = await setBankDetails(employee.id, { bankCode: "058", bankName: "Guaranty Trust Bank", accountNumber: "0123456789" });
  assert.equal(r.checked, true);
  const row = await db.employee.findUniqueOrThrow({ where: { id: employee.id } });
  assert.ok(row.accountNumberEnc && !row.accountNumberEnc.includes("0123456789"), "the number is not stored in the clear");
  assert.equal(row.accountLast4, "6789");
  assert.equal(bankInClear(row).accountNumber, "0123456789");
  assert.equal(row.bankStatus, "PENDING");
  await assert.rejects(reviewBank(employee.id, true, undefined, employee.userId), /your own/);
  assert.equal((await reviewBank(employee.id, true, undefined, hrId)).bankStatus, "VERIFIED");
  await assert.rejects(setBankDetails(employee.id, { bankCode: "058", bankName: "GTBank", accountNumber: "123" }), /10-digit/);
});

test("the checklist is complete only with every required document approved and the bank verified", async () => {
  const { employee } = await registerStaff(person(6));
  await db.user.update({ where: { id: employee.userId }, data: { status: "ACTIVE", passwordHash: "x" } });
  for (const kind of ["cv", "certificate", "trcn", "id", "guarantor"] as const) {
    const d = await saveStaffDocument(employee.id, kind, pdf, { by: employee.userId, hr: false });
    await reviewStaffDocument(d.id, true, undefined, hrId);
  }
  let e = (await employeeDetail(employee.id))!;
  assert.equal(e.onboarding.complete, false);
  assert.deepEqual(e.onboarding.missingDocs, ["passport"]);
  const p = await saveStaffDocument(employee.id, "passport", jpg, { by: employee.userId, hr: false });
  await reviewStaffDocument(p.id, true, undefined, hrId);
  await setBankDetails(employee.id, { bankCode: "058", bankName: "GTBank", accountNumber: "0123456780" });
  await reviewBank(employee.id, true, undefined, hrId);
  e = (await employeeDetail(employee.id))!;
  assert.equal(e.onboarding.complete, true);
  // A non-teacher doesn't need a TRCN licence
  assert.ok(!onboarding({ ...e, isTeacher: false }).missingDocs.length);
});

test("marking someone as left stops their sign-in and keeps the record", async () => {
  const { employee } = await registerStaff(person(7));
  await db.user.update({ where: { id: employee.userId }, data: { status: "ACTIVE", passwordHash: "x" } });
  await setEmployeeStatus(employee.id, "INACTIVE");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: employee.userId } })).status, "DISABLED");
  await setEmployeeStatus(employee.id, "ACTIVE");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: employee.userId } })).status, "ACTIVE");
});
