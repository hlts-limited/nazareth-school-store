"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { db } from "@/shared/lib/db";
import { normalizePhone } from "@/shared/lib/format";
import { readUpload } from "@/shared/lib/storage";
import { env } from "@/shared/config/env";
import { auditActor, getViewer, staffFor, type StaffViewer } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { listBanks } from "@/modules/payments";
import { sendStaffInvite } from "@/modules/staff";
import {
  STAFF_DOC_KINDS, STAFF_SECTIONS_LIST, deleteStaffDocument, registerStaff, reviewBank, reviewStaffDocument, saveStaffDocument, setBankDetails,
  setEmployeeStatus, staffDocLabel, updateEmployee, updateOwnProfile, type EmployeeInput, type StaffDocKind,
} from "./service";

const zDay = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const zOptDay = z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : undefined));
const day = (v: string) => new Date(`${v}T00:00:00Z`);
/** Naira typed by a person (commas and ₦ allowed) → integer kobo */
const zNaira = (msg: string) => z.preprocess((v) => (typeof v === "string" ? v.replace(/[,\s₦]/g, "") : v), z.coerce.number({ invalid_type_error: msg }).min(0, msg).max(1e9, "That amount looks too large"));
const zOptNaira = z.preprocess((v) => (typeof v === "string" ? v.replace(/[,\s₦]/g, "") || "0" : v ?? "0"), z.coerce.number({ invalid_type_error: "Enter an amount in naira" }).min(0).max(1e10));
const zPhone = z.string().trim().optional().transform((v, ctx) => {
  if (!v) return undefined;
  const p = normalizePhone(v);
  if (!p) { ctx.addIssue({ code: "custom", message: "Enter a valid Nigerian phone number" }); return z.NEVER; }
  return p;
});
const rolesField = z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v ? (Array.isArray(v) ? v : [v]) : []));
const sections = STAFF_SECTIONS_LIST.map((s) => s.id) as [string, ...string[]];

const statutory = {
  tin: zOptText(30), pfaName: zOptText(80), rsaPin: zOptText(30), nhfNumber: zOptText(30), nhisNumber: zOptText(30),
  annualRent: zOptNaira,
};

const recordFields = z.object({
  firstName: zText(60, "Enter a first name"), lastName: zText(60, "Enter a surname"), phone: zPhone,
  gender: z.enum(["Female", "Male"]).optional().or(z.literal("").transform(() => undefined)), dateOfBirth: zOptDay,
  section: z.enum(sections, { errorMap: () => ({ message: "Choose a section" }) }), position: zText(60, "Enter the position"), isTeacher: z.string().optional(),
  hireDate: zDay("Enter the hire date"), employmentType: z.enum(["FULL_TIME", "PART_TIME"]), monthlyGross: zNaira("Enter the monthly gross salary").optional(),
  ...statutory,
});

const toInput = (d: z.infer<typeof recordFields>): Omit<EmployeeInput, "email"> => ({
  firstName: d.firstName, lastName: d.lastName, phone: d.phone, gender: d.gender, dateOfBirth: d.dateOfBirth, section: d.section, position: d.position,
  isTeacher: d.isTeacher === "on", hireDate: day(d.hireDate), employmentType: d.employmentType, monthlyGrossKobo: Math.round((d.monthlyGross ?? 0) * 100),
  tin: d.tin, pfaName: d.pfaName, rsaPin: d.rsaPin, nhfNumber: d.nhfNumber, nhisNumber: d.nhisNumber, annualRentKobo: BigInt(Math.round(d.annualRent * 100)),
});

/** Roles HR may give from Staff records. Higher roles (HR, Bursar, Proprietor) need Staff & roles permission. */
function allowedRoles(v: StaffViewer, asked: string[]) {
  const high = ["hr", "bursar", "proprietor"];
  const bad = asked.filter((r) => high.includes(r) && !v.permissions.has("staff.manage"));
  if (bad.length) throw new Error("Only the Super Admin can give the HR, Bursar or Proprietor role.");
  return asked;
}

export async function registerStaffAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("hr.manage");
    const d = parseForm(recordFields.extend({ email: z.string().trim().email("Enter a valid email"), roles: rolesField }), form);
    let roles: string[];
    try { roles = allowedRoles(v, d.roles); } catch (e) { return fail((e as Error).message); }
    const input = { ...toInput(d), email: d.email };
    if (!v.permissions.has("hr.salary")) input.monthlyGrossKobo = 0;
    const { employee, invited } = await registerStaff(input, roles);
    await audit(await auditActor(v), "Registered staff", "Employee", employee.id, { staffCode: employee.staffCode, email: d.email, section: d.section, position: d.position, roles: ["staff", ...roles] });
    const sent = invited ? (env().RESEND_API_KEY ? ` An invite was emailed to ${d.email}.` : ` Email isn't set up yet, so copy the invite link from their record and send it to them.`) : " They already had a staff account, so it was linked.";
    return ok(`${d.firstName} ${d.lastName} registered as ${employee.staffCode}.${sent}`, { redirect: `/admin/hr/${employee.id}` });
  });
}

export async function updateEmployeeAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("hr.manage");
    const d = parseForm(recordFields.extend({ id: zText(100) }), form);
    const before = await db.employee.findUniqueOrThrow({ where: { id: d.id } });
    const salary = v.permissions.has("hr.salary") && d.monthlyGross !== undefined;
    const e = await updateEmployee(d.id, toInput(d), { salary });
    const changed = salary && before.monthlyGrossKobo !== e.monthlyGrossKobo ? { salaryFrom: before.monthlyGrossKobo / 100, salaryTo: e.monthlyGrossKobo / 100 } : {};
    await audit(await auditActor(v), salary && "salaryFrom" in changed ? "Changed salary" : "Updated staff record", "Employee", e.id, { staffCode: e.staffCode, ...changed });
    return ok("Staff record saved.");
  });
}

export async function setEmployeeStatusAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("hr.manage");
    const id = String(form.get("id"));
    const status = form.get("status") === "ACTIVE" ? "ACTIVE" : "INACTIVE";
    const target = await db.employee.findUniqueOrThrow({ where: { id } });
    if (target.userId === v.user.id) return fail("You can't change your own record's status.");
    const e = await setEmployeeStatus(id, status);
    await audit(await auditActor(v), status === "ACTIVE" ? "Reactivated staff" : "Made staff inactive", "Employee", e.id, { staffCode: e.staffCode });
    return ok(status === "ACTIVE" ? "Staff member is active again." : "Staff member marked as left. They can no longer sign in; their record is kept.");
  });
}

export async function resendStaffInviteAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("hr.manage");
    const e = await db.employee.findUniqueOrThrow({ where: { id: String(form.get("id")) }, include: { user: true } });
    if (e.user.status === "ACTIVE" && e.user.passwordHash) return fail("They have already set their password. Use Reset on Staff & roles if they've forgotten it.");
    await sendStaffInvite(e.userId);
    await audit(await auditActor(v), "Sent staff invite", "Employee", e.id, { staffCode: e.staffCode });
    return ok(env().RESEND_API_KEY ? `New invite emailed to ${e.user.email}.` : "New invite link created. Email isn't set up yet, so copy the link and send it to them.");
  });
}

// ---------- Documents ----------

/** Who is uploading for whom: the staff member for themselves, or HR for anyone. */
async function viewerFor(employeeId: string) {
  const v = await getViewer();
  if (!v || v.kind !== "staff") throw new Error("NOT_ALLOWED");
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
  const own = emp.userId === v.user.id;
  const hr = v.permissions.has("hr.manage");
  if (!(own && v.permissions.has("self.service")) && !hr) throw new Error("NOT_ALLOWED");
  return { v, emp, own, hr };
}

export async function uploadStaffDocAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    let who;
    try { who = await viewerFor(String(form.get("employeeId"))); } catch { return fail("You can't upload documents for this person."); }
    const kind = String(form.get("kind")) as StaffDocKind;
    if (!STAFF_DOC_KINDS.some((k) => k.kind === kind)) return fail("Choose what kind of document this is.", { kind: "Required" });
    const file = form.get("file") as File | null;
    const up = await readUpload(file, { allowPdf: kind !== "passport" });
    if ("error" in up) return fail(up.error!, { file: up.error! });
    const exp = String(form.get("expiresAt") ?? "");
    const doc = await saveStaffDocument(who.emp.id, kind, { buf: up.buf, mime: up.mime, ext: up.ext, name: file?.name ?? kind }, { by: who.v.user.id, hr: who.hr, expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(exp) ? day(exp) : undefined });
    await audit(await auditActor(who.v), "Uploaded staff document", "Employee", who.emp.id, { staffCode: who.emp.staffCode, kind, for: who.own ? "self" : "staff member" });
    return ok(doc.status === "APPROVED" ? `${staffDocLabel(kind)} added.` : `${staffDocLabel(kind)} uploaded. HR will review it.`);
  });
}

export async function reviewStaffDocAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("hr.manage");
    const d = parseForm(z.object({ id: zText(100), decision: z.enum(["approve", "reject"]), note: zOptText(300) }), form);
    const r = await reviewStaffDocument(d.id, d.decision === "approve", d.note, v.user.id);
    await audit(await auditActor(v), d.decision === "approve" ? "Approved staff document" : "Rejected staff document", "Employee", r.employee.id, { staffCode: r.employee.staffCode, kind: r.doc.kind, note: d.note });
    return ok(d.decision === "approve" ? "Document approved." : "Document rejected. They've been told why.");
  });
}

export async function deleteStaffDocAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const doc = await db.employeeDocument.findUniqueOrThrow({ where: { id: String(form.get("id")) } });
    let who;
    try { who = await viewerFor(doc.employeeId); } catch { return fail("You can't remove this document."); }
    if (!who.hr && doc.status === "APPROVED") return fail("This document has been approved. Ask HR if it needs replacing.");
    await deleteStaffDocument(doc.id);
    await audit(await auditActor(who.v), "Removed staff document", "Employee", who.emp.id, { staffCode: who.emp.staffCode, kind: doc.kind });
    return ok("Document removed.");
  });
}

// ---------- Bank details ----------

export async function setBankAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    let who;
    try { who = await viewerFor(String(form.get("employeeId"))); } catch { return fail("You can't change bank details for this person."); }
    const d = parseForm(z.object({
      bankCode: zText(20, "Choose the bank"), accountNumber: z.string().trim().regex(/^\d{10}$/, "Enter the 10-digit account number"), accountName: zOptText(120),
    }), form);
    const bank = (await listBanks()).find((b) => b.code === d.bankCode);
    if (!bank) return fail("Choose the bank from the list.", { bankCode: "Choose a bank" });
    const r = await setBankDetails(who.emp.id, { bankCode: bank.code, bankName: bank.name, accountNumber: d.accountNumber, accountName: d.accountName });
    await audit(await auditActor(who.v), "Entered bank details", "Employee", who.emp.id, { staffCode: who.emp.staffCode, bank: bank.name, last4: d.accountNumber.slice(-4), nameChecked: r.checked });
    return ok(`Saved: ${bank.name}, account ending ${d.accountNumber.slice(-4)}, in the name of ${r.accountName}. The Bursar will verify it before salaries are paid.`);
  });
}

export async function reviewBankAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("hr.bank.approve");
    const d = parseForm(z.object({ id: zText(100), decision: z.enum(["approve", "reject"]), note: zOptText(300) }), form);
    const e = await reviewBank(d.id, d.decision === "approve", d.note, v.user.id);
    await audit(await auditActor(v), d.decision === "approve" ? "Verified bank details" : "Rejected bank details", "Employee", e.id, { staffCode: e.staffCode, bank: e.bankName, last4: e.accountLast4, note: d.note });
    return ok(d.decision === "approve" ? "Bank details verified. This person can now be paid." : "Bank details rejected. They've been told why.");
  });
}

// ---------- Own profile ----------

export async function updateOwnProfileAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("self.service");
    const d = parseForm(z.object({ phone: zPhone, gender: z.enum(["Female", "Male"]).optional().or(z.literal("").transform(() => undefined)), dateOfBirth: zOptDay, ...statutory }), form);
    const e = await updateOwnProfile(v.user.id, { ...d, annualRentKobo: BigInt(Math.round(d.annualRent * 100)) });
    await audit(await auditActor(v), "Updated own staff profile", "Employee", e.id, { staffCode: e.staffCode });
    return ok("Your details are saved.");
  });
}
