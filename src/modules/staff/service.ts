import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { randomToken } from "@/shared/lib/crypto";
import { env } from "@/shared/config/env";
import { SCHOOL } from "@/shared/config/school";
import { ROLE_DEFS } from "@/modules/access-control";
import { newTotpSecret, revokeAllForUser } from "@/modules/auth";
import { notify } from "@/modules/notifications";

const ownerEmail = () => env().SEED_ADMIN_EMAIL || undefined;

/** Staff shown on Staff & roles: everyone except the owner account. */
export const listStaff = () => db.user.findMany({
  where: { type: "STAFF", ...(ownerEmail() ? { NOT: { email: ownerEmail() } } : {}) },
  include: { roles: true }, orderBy: [{ status: "asc" }, { firstName: "asc" }],
});

/** The owner account can't be changed from Staff & roles, even by a crafted request. */
async function assertNotOwner(userId: string) {
  const owner = ownerEmail();
  if (!owner) return;
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (u?.email === owner) throw new UserError("The owner account can't be changed here.");
}

async function sendStaffInvite(userId: string) {
  const token = randomToken(24);
  const u = await db.user.update({ where: { id: userId }, data: { inviteToken: token, inviteExpiresAt: new Date(Date.now() + 7 * 86400_000), totpSecret: newTotpSecret() } });
  await notify(u.id, `Your ${SCHOOL.storeName} staff account`, `Set your password and two-factor sign-in here: ${env().APP_URL}/invite/${token} (valid for 7 days)`, ["email"]);
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
