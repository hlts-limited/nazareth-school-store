import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { randomToken } from "@/shared/lib/crypto";
import { env } from "@/shared/config/env";
import { SCHOOL } from "@/shared/config/school";
import { ROLE_DEFS } from "@/modules/access-control";
import { newTotpSecret, revokeAllForUser } from "@/modules/auth";
import { notify } from "@/modules/notifications";

/** The owner (first Super Admin) and the Alpha Admin: hidden from Staff & roles and can't be changed there. */
const protectedEmails = () => [env().SEED_ADMIN_EMAIL, env().ALPHA_ADMIN_EMAIL].filter((e): e is string => !!e);

/** Staff shown on Staff & roles: everyone except the owner and Alpha accounts. */
export const listStaff = () => db.user.findMany({
  where: { type: "STAFF", ...(protectedEmails().length ? { NOT: { email: { in: protectedEmails() } } } : {}) },
  include: { roles: true }, orderBy: [{ status: "asc" }, { firstName: "asc" }],
});

/** The owner account can't be changed from Staff & roles, even by a crafted request. */
async function assertNotOwner(userId: string) {
  const emails = protectedEmails();
  if (!emails.length) return;
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (u?.email && emails.includes(u.email)) throw new UserError("The owner account can't be changed here.");
}

/** Email a set-up link. Two-factor sign-in is set up only when one of the person's roles needs it
 *  (e.g. not for a teacher who only clocks in and sees their payslips). */
export async function sendStaffInvite(userId: string) {
  const token = randomToken(24);
  const roles = (await db.userRole.findMany({ where: { userId }, select: { roleId: true } })).map((r) => r.roleId);
  const needs2fa = ROLE_DEFS.some((r) => roles.includes(r.id) && r.requires2fa);
  const u = await db.user.update({ where: { id: userId }, data: { inviteToken: token, inviteExpiresAt: new Date(Date.now() + 7 * 86400_000), totpSecret: needs2fa ? newTotpSecret() : null } });
  await notify(u.id, `Your ${SCHOOL.name} staff account`, `Set your password${needs2fa ? " and two-factor sign-in" : ""} here: ${env().APP_URL}/invite/${token} (valid for 7 days)`, ["email"]);
}

export async function inviteStaff(input: { firstName: string; lastName: string; email: string; phone?: string; roles: string[] }) {
  const roles = input.roles.filter((r) => ROLE_DEFS.some((d) => d.id === r));
  if (!roles.length) throw new UserError("Choose at least one role.", { roles: "Required" });
  const email = input.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) throw new UserError("That email is already used.", { email: "Already used" });
  const u = await db.user.create({
    data: { type: "STAFF", status: "INVITED", firstName: input.firstName, lastName: input.lastName, email, phone: input.phone || null, roles: { create: roles.map((roleId) => ({ roleId })) } },
  });
  await sendStaffInvite(u.id);
  return u;
}

export async function setRoles(userId: string, roles: string[]) {
  if (!roles.length) throw new UserError("Choose at least one role.");
  await assertNotOwner(userId);
  await db.$transaction([db.userRole.deleteMany({ where: { userId } }), db.userRole.createMany({ data: roles.map((roleId) => ({ userId, roleId })) })]);
  await revokeAllForUser(userId, "Roles changed");
}

export async function setStatus(userId: string, status: "ACTIVE" | "DISABLED") {
  await assertNotOwner(userId);
  await db.user.update({ where: { id: userId }, data: { status } });
  if (status === "DISABLED") await revokeAllForUser(userId, "Account disabled");
}

/** Password reset for staff = a fresh invite (new password + new 2FA set-up) */
export async function resetStaff(userId: string) {
  await assertNotOwner(userId);
  await db.user.update({ where: { id: userId }, data: { passwordHash: null, status: "INVITED" } });
  await revokeAllForUser(userId, "Password reset");
  await sendStaffInvite(userId);
}

/**
 * Alpha Admin only: remove a staff member for good, with their documents, attendance and photos.
 * Refused for the owner and Alpha accounts, for yourself, and for anyone already in a payroll run
 * (pay records must be kept: mark them as Left instead).
 */
export async function deleteStaffMember(userId: string, byUserId: string) {
  if (userId === byUserId) throw new UserError("You can't delete your own account.");
  const user = await db.user.findUnique({ where: { id: userId }, include: { employee: { include: { documents: true, attendance: true, _count: { select: { payrollItems: true } } } } } });
  if (!user || user.type !== "STAFF") throw new UserError("That staff member wasn't found.");
  if (protectedEmails().some((e) => e.toLowerCase() === user.email?.toLowerCase())) throw new UserError("The owner and Alpha accounts can't be deleted.");
  const e = user.employee;
  if (e && e._count.payrollItems > 0) throw new UserError(`${user.firstName} has been on a payroll, so their pay records must be kept. Mark them as Left on their staff record instead.`);
  const files = e ? [...e.documents.map((d) => d.fileKey), ...e.attendance.flatMap((a) => [a.inPhotoKey, a.outPhotoKey]).filter((k): k is string => !!k)] : [];
  await db.$transaction(async (tx) => {
    if (e) await tx.employee.delete({ where: { id: e.id } }); // documents, attendance, leave, clock attempts go with it
    await tx.user.delete({ where: { id: userId } }); // roles, sessions, notifications go with it
  });
  const { storage } = await import("@/shared/lib/storage");
  for (const k of files) await storage().delete(k).catch(() => undefined); // a missing file is fine
  return { name: `${user.firstName} ${user.lastName}`, staffCode: e?.staffCode ?? null, files: files.length };
}
