import type { EmploymentType, Prisma } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { decryptField, encryptField, randomToken } from "@/shared/lib/crypto";
import { storage } from "@/shared/lib/storage";
import { resolveAccount } from "@/modules/payments";
import { revokeAllForUser } from "@/modules/auth";
import { sendStaffInvite } from "@/modules/staff";
import { notify } from "@/modules/notifications";
import { normalizePhone } from "@/shared/lib/format";
import { env } from "@/shared/config/env";
import { SCHOOL } from "@/shared/config/school";
import { STAFF_DOC_KINDS, requiredDocKinds, staffDocLabel, type StaffDocKind } from "./docs";

export * from "./docs";

// ---------- WhatsApp links (the school sends invites and payslips this way) ----------

/** A WhatsApp link that opens a chat with the staff member, with the message typed out. null without a valid phone. */
export function whatsAppTo(phone: string | null | undefined, text: string) {
  const local = phone ? normalizePhone(phone) : null;
  return local ? `https://wa.me/234${local.slice(1)}?text=${encodeURIComponent(text)}` : null;
}

export const staffInviteText = (firstName: string, token: string) =>
  `Hello ${firstName}, this is ${SCHOOL.name}. Set up your staff account here: ${env().APP_URL}/invite/${token} (valid for 7 days). You will clock in, upload your documents and see your payslips there.`;

// ---------- Staff records ----------

export type EmployeeInput = {
  firstName: string; lastName: string; email: string; phone?: string; gender?: string; dateOfBirth?: Date;
  section: string; branch: string; position: string; isTeacher: boolean; hireDate: Date; employmentType: EmploymentType;
  monthlyGrossKobo: number; tin?: string; pfaName?: string; rsaPin?: string; nhfNumber?: string; nhisNumber?: string; annualRentNaira: number;
};

/** Roles a staff record can be given from Staff records (the back-office roles stay on Staff & roles). */
export const STAFF_APP_ROLES = ["staff", "head", "hr", "bursar", "proprietor"] as const;

async function nextStaffCode() {
  const last = await db.employee.findFirst({ where: { staffCode: { startsWith: "NS-" } }, orderBy: { staffCode: "desc" }, select: { staffCode: true } });
  const n = last ? Number(last.staffCode.slice(3)) + 1 : 1;
  return `NS-${String(n).padStart(3, "0")}`;
}

/**
 * HR registers a staff member: a staff account (with the Staff role, plus any extra staff-app roles) and their record,
 * then a "create your password" email. Someone who already has a back-office account is linked instead of invited again.
 */
export async function registerStaff(input: EmployeeInput, extraRoles: string[] = []) {
  const email = input.email.trim().toLowerCase();
  const roles = ["staff", ...extraRoles.filter((r) => (STAFF_APP_ROLES as readonly string[]).includes(r) && r !== "staff")];
  const existing = await db.user.findUnique({ where: { email }, include: { employee: true, roles: true } });
  if (existing && existing.type !== "STAFF") throw new UserError("That email belongs to a parent account. Use a different email for the staff account.", { email: "Used by a parent" });
  if (existing?.employee) throw new UserError(`${existing.firstName} ${existing.lastName} already has a staff record (${existing.employee.staffCode}).`, { email: "Already registered" });
  const record = {
    phone: input.phone ?? null,
    gender: input.gender ?? null, dateOfBirth: input.dateOfBirth ?? null, section: input.section, branch: input.branch, position: input.position, isTeacher: input.isTeacher,
    hireDate: input.hireDate, employmentType: input.employmentType, monthlyGrossKobo: input.monthlyGrossKobo,
    tin: input.tin ?? null, pfaName: input.pfaName ?? null, rsaPin: input.rsaPin ?? null, nhfNumber: input.nhfNumber ?? null, nhisNumber: input.nhisNumber ?? null,
    annualRentNaira: input.annualRentNaira,
  };

  for (let attempt = 0; ; attempt++) {
    try {
      const staffCode = await nextStaffCode();
      if (existing) {
        const have = existing.roles.map((r) => r.roleId);
        const employee = await db.$transaction(async (tx) => {
          const add = roles.filter((r) => !have.includes(r));
          if (add.length) await tx.userRole.createMany({ data: add.map((roleId) => ({ userId: existing.id, roleId })) });
          return tx.employee.create({ data: { ...record, staffCode, userId: existing.id } });
        });
        return { employee, invited: false };
      }
      const user = await db.user.create({
        data: {
          type: "STAFF", status: "INVITED", firstName: input.firstName, lastName: input.lastName, email,
          roles: { create: roles.map((roleId) => ({ roleId })) }, employee: { create: { ...record, staffCode } },
        },
        include: { employee: true },
      });
      await sendStaffInvite(user.id);
      return { employee: user.employee!, invited: true };
    } catch (e) {
      // Two people registering at once can pick the same staff code: try the next one
      if ((e as { code?: string }).code === "P2002" && attempt < 3 && String((e as { meta?: { target?: string[] } }).meta?.target ?? "").includes("staffCode")) continue;
      throw e;
    }
  }
}

export async function updateEmployee(id: string, input: Omit<EmployeeInput, "email">, opts: { salary: boolean }) {
  const emp = await db.employee.findUniqueOrThrow({ where: { id } });
  await db.user.update({ where: { id: emp.userId }, data: { firstName: input.firstName, lastName: input.lastName } });
  return db.employee.update({
    where: { id },
    data: {
      phone: input.phone ?? null,
      gender: input.gender ?? null, dateOfBirth: input.dateOfBirth ?? null, section: input.section, branch: input.branch, position: input.position, isTeacher: input.isTeacher,
      hireDate: input.hireDate, employmentType: input.employmentType,
      tin: input.tin ?? null, pfaName: input.pfaName ?? null, rsaPin: input.rsaPin ?? null, nhfNumber: input.nhfNumber ?? null, nhisNumber: input.nhisNumber ?? null,
      annualRentNaira: input.annualRentNaira,
      ...(opts.salary ? { monthlyGrossKobo: input.monthlyGrossKobo } : {}),
    },
  });
}

/** The fields staff fill in themselves on their own page. */
export type SelfInput = { phone?: string; gender?: string; dateOfBirth?: Date; tin?: string; pfaName?: string; rsaPin?: string; nhfNumber?: string; nhisNumber?: string; annualRentNaira: number };

export async function updateOwnProfile(userId: string, input: SelfInput) {
  const emp = await db.employee.findUniqueOrThrow({ where: { userId } });
  return db.employee.update({
    where: { id: emp.id },
    data: {
      phone: input.phone ?? null,
      gender: input.gender ?? null, dateOfBirth: input.dateOfBirth ?? null, tin: input.tin ?? null, pfaName: input.pfaName ?? null,
      rsaPin: input.rsaPin ?? null, nhfNumber: input.nhfNumber ?? null, nhisNumber: input.nhisNumber ?? null, annualRentNaira: input.annualRentNaira,
    },
  });
}

/** Leaving: the record is kept (for payroll history) but the person can no longer sign in. */
export async function setEmployeeStatus(id: string, status: "ACTIVE" | "INACTIVE") {
  const emp = await db.employee.update({ where: { id }, data: { status }, include: { user: true } });
  if (status === "INACTIVE") {
    await db.user.update({ where: { id: emp.userId }, data: { status: "DISABLED" } });
    await revokeAllForUser(emp.userId, "Staff record made inactive");
  } else if (emp.user.status === "DISABLED") {
    await db.user.update({ where: { id: emp.userId }, data: { status: emp.user.passwordHash ? "ACTIVE" : "INVITED" } });
  }
  return emp;
}

export type EmployeeSearch = { q?: string; section?: string; status?: "ACTIVE" | "INACTIVE" | "all"; onlySection?: string | null };

export async function listEmployees(s: EmployeeSearch) {
  const q = s.q?.trim();
  const where: Prisma.EmployeeWhereInput = {
    ...(s.status && s.status !== "all" ? { status: s.status } : s.status === "all" ? {} : { status: "ACTIVE" }),
    ...(s.onlySection ? { section: s.onlySection } : s.section ? { section: s.section } : {}),
    ...(q ? { OR: [{ staffCode: { contains: q, mode: "insensitive" } }, { position: { contains: q, mode: "insensitive" } }, { user: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } }] } : {}),
  };
  const rows = await db.employee.findMany({ where, include: { user: true, documents: { select: { kind: true, status: true } } }, orderBy: [{ staffCode: "asc" }] });
  return rows.map((e) => ({ ...e, onboarding: onboarding(e) }));
}

export async function employeeDetail(id: string) {
  const e = await db.employee.findUnique({ where: { id }, include: { user: { include: { roles: true } }, documents: { orderBy: [{ kind: "asc" }, { uploadedAt: "desc" }] } } });
  return e ? { ...e, onboarding: onboarding(e) } : null;
}

export async function myEmployee(userId: string) {
  const e = await db.employee.findUnique({ where: { userId }, include: { user: { include: { roles: true } }, documents: { orderBy: [{ kind: "asc" }, { uploadedAt: "desc" }] } } });
  return e ? { ...e, onboarding: onboarding(e) } : null;
}

// ---------- Onboarding checklist ----------

type ForChecklist = {
  isTeacher: boolean; bankStatus: string;
  user: { status: string; passwordHash: string | null };
  documents: { kind: string; status: string }[];
};

/** The steps before a staff member is complete: account, sign-in, photo, every required document approved, bank verified. */
export function onboarding(e: ForChecklist) {
  const approved = (k: string) => e.documents.some((d) => d.kind === k && d.status === "APPROVED");
  const required = requiredDocKinds(e.isTeacher);
  const missingDocs = required.filter((k) => !approved(k));
  const steps = [
    { id: "account", label: "Account created", done: true },
    { id: "signin", label: "Password set and signed in", done: !!e.user.passwordHash && e.user.status === "ACTIVE" },
    { id: "photo", label: "Passport photograph approved", done: approved("passport") },
    { id: "docs", label: missingDocs.length ? `Required documents approved (${required.length - missingDocs.length} of ${required.length})` : "Required documents approved", done: !missingDocs.length },
    { id: "bank", label: "Bank details verified", done: e.bankStatus === "VERIFIED" },
  ];
  return { steps, missingDocs, complete: steps.every((s) => s.done), docsComplete: !missingDocs.length };
}

// ---------- Documents ----------

export async function saveStaffDocument(employeeId: string, kind: StaffDocKind, file: { buf: Buffer; mime: string; ext: string; name: string }, opts: { by: string; hr: boolean; expiresAt?: Date }) {
  const def = STAFF_DOC_KINDS.find((d) => d.kind === kind);
  if (!def) throw new UserError("Choose what kind of document this is.");
  if ("hrOnly" in def && def.hrOnly && !opts.hr) throw new UserError("Only HR can add this document.");
  const key = `staff/${employeeId}/${kind}-${randomToken(8).replace(/[^a-zA-Z0-9]/g, "")}.${file.ext}`;
  await storage().put(key, file.buf, file.mime);
  // One-of-a-kind documents replace the earlier upload; certificates and references add up
  const old = def.many ? [] : await db.employeeDocument.findMany({ where: { employeeId, kind } });
  const doc = await db.$transaction(async (tx) => {
    if (old.length) await tx.employeeDocument.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return tx.employeeDocument.create({
      data: {
        employeeId, kind, fileKey: key, fileName: file.name.slice(0, 120), mimeType: file.mime, size: file.buf.length, uploadedById: opts.by,
        expiresAt: opts.expiresAt ?? null,
        // A document HR adds itself (e.g. the contract) needs no second look
        ...(opts.hr && "hrOnly" in def && def.hrOnly ? { status: "APPROVED", reviewedById: opts.by, reviewedAt: new Date() } : {}),
      },
    });
  });
  for (const o of old) await storage().delete(o.fileKey).catch(() => undefined);
  return doc;
}

export async function reviewStaffDocument(docId: string, approve: boolean, note: string | undefined, by: string) {
  const doc = await db.employeeDocument.findUniqueOrThrow({ where: { id: docId }, include: { employee: true } });
  if (doc.employee.userId === by) throw new UserError("You can't review your own documents. Ask another member of HR or the Proprietor.");
  if (!approve && !note) throw new UserError("Say what's wrong so they can fix it.", { note: "Required when rejecting" });
  const updated = await db.employeeDocument.update({ where: { id: docId }, data: { status: approve ? "APPROVED" : "REJECTED", note: approve ? null : note, reviewedById: by, reviewedAt: new Date() } });
  await notify(doc.employee.userId, approve ? "Document approved" : "Document needs attention",
    approve ? `Your ${staffDocLabel(doc.kind)} has been approved.` : `Your ${staffDocLabel(doc.kind)} was not accepted: ${note}. Please upload it again on your staff page.`, ["email"]);
  return { doc: updated, employee: doc.employee };
}

export async function deleteStaffDocument(docId: string) {
  const doc = await db.employeeDocument.delete({ where: { id: docId } });
  await storage().delete(doc.fileKey).catch(() => undefined);
  return doc;
}

// ---------- Bank details ----------

export async function setBankDetails(employeeId: string, input: { bankCode: string; bankName: string; accountNumber: string; accountName?: string }) {
  if (!/^\d{10}$/.test(input.accountNumber)) throw new UserError("Enter the 10-digit account number (NUBAN).", { accountNumber: "10 digits" });
  const checked = await resolveAccount(input.accountNumber, input.bankCode);
  const name = checked ?? input.accountName?.trim();
  if (!name) throw new UserError("The account name couldn't be checked automatically. Type the name on the account.", { accountName: "Required" });
  const emp = await db.employee.update({
    where: { id: employeeId },
    data: {
      bankCode: input.bankCode, bankName: input.bankName, accountNumberEnc: encryptField(input.accountNumber), accountLast4: input.accountNumber.slice(-4),
      accountNameEnc: encryptField(name), accountNameChecked: !!checked, bankStatus: "PENDING", bankNote: null, bankReviewedById: null, bankReviewedAt: null,
      paystackRecipient: null, // a new account needs a new transfer recipient
    },
  });
  return { employee: emp, accountName: name, checked: !!checked };
}

/** The Bursar approves or rejects bank details. Nobody approves their own. */
export async function reviewBank(employeeId: string, approve: boolean, note: string | undefined, by: string) {
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
  if (emp.userId === by) throw new UserError("You can't approve your own bank details. Another Bursar or the Proprietor must do it.");
  if (emp.bankStatus !== "PENDING") throw new UserError("There are no bank details waiting for a decision.");
  if (!approve && !note) throw new UserError("Say what's wrong so they can fix it.", { note: "Required when rejecting" });
  const updated = await db.employee.update({ where: { id: employeeId }, data: { bankStatus: approve ? "VERIFIED" : "REJECTED", bankNote: approve ? null : note, bankReviewedById: by, bankReviewedAt: new Date() } });
  await notify(emp.userId, approve ? "Bank details verified" : "Bank details need attention",
    approve ? "Your bank details have been verified for salary payments." : `Your bank details were not accepted: ${note}. Please enter them again on your staff page.`, ["email"]);
  return updated;
}

/** Account number and name in full, for the Bursar's check. */
export function bankInClear(e: { accountNumberEnc: string | null; accountNameEnc: string | null }) {
  return {
    accountNumber: e.accountNumberEnc ? decryptField(e.accountNumberEnc) : null,
    accountName: e.accountNameEnc ? decryptField(e.accountNameEnc) : null,
  };
}

// ---------- What needs a decision ----------

export async function hrReviewQueue(opts: { docs: boolean; bank: boolean }) {
  const [docs, banks] = await Promise.all([
    opts.docs ? db.employeeDocument.findMany({ where: { status: "PENDING" }, include: { employee: { include: { user: true } } }, orderBy: { uploadedAt: "asc" } }) : [],
    opts.bank ? db.employee.findMany({ where: { bankStatus: "PENDING" }, include: { user: true }, orderBy: { updatedAt: "asc" } }) : [],
  ]);
  return { docs, banks };
}

export async function hrPendingCount() {
  const [docs, banks] = await Promise.all([db.employeeDocument.count({ where: { status: "PENDING" } }), db.employee.count({ where: { bankStatus: "PENDING" } })]);
  return docs + banks;
}

/** IDs and licences that lapse within 30 days, for the daily reminder. */
export async function expiringDocuments(within = 30) {
  const until = new Date(Date.now() + within * 86400_000);
  return db.employeeDocument.findMany({ where: { expiresAt: { lte: until }, status: "APPROVED", employee: { status: "ACTIVE" } }, include: { employee: { include: { user: true } } } });
}

/** Daily: remind staff (and leave a note for HR) when an ID or licence lapses in 30 days, 7 days, or today. */
export async function remindExpiringDocuments(now = new Date()) {
  const docs = await expiringDocuments(30);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let sent = 0;
  for (const d of docs) {
    const left = Math.round((d.expiresAt!.getTime() - today) / 86400_000);
    if (![30, 7, 0].includes(left)) continue;
    await notify(d.employee.userId, "Document about to expire",
      left > 0 ? `Your ${staffDocLabel(d.kind)} expires in ${left} days. Please upload the renewed one on your staff page.` : `Your ${staffDocLabel(d.kind)} expires today. Please upload the renewed one on your staff page.`, ["inapp"]);
    sent++;
  }
  return sent;
}
