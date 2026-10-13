/* Set the Super Admin's sign-in email and password from SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.
 * Use it to recover access or to change the first admin's login:
 *   npm run set-admin                       (reads .env)
 * It updates the oldest Super Admin account, signs that account out everywhere, and keeps its 2FA secret.
 * The password is never printed.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { passwordProblem } from "../src/modules/auth/password";

const db = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD first.");
  const problem = passwordProblem(password);
  if (problem) throw new Error(`SEED_ADMIN_PASSWORD: ${problem}`);

  const admin = await db.user.findFirst({ where: { type: "STAFF", roles: { some: { roleId: "admin" } } }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("No Super Admin found. Run the seed to create one.");
  const clash = await db.user.findUnique({ where: { email } });
  if (clash && clash.id !== admin.id) throw new Error(`${email} already belongs to another account.`);

  await db.user.update({ where: { id: admin.id }, data: { email, passwordHash: await bcrypt.hash(password, 12), status: "ACTIVE" } });
  const ended = await db.session.updateMany({ where: { userId: admin.id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "Admin login changed" } });
  console.log(`Super Admin ${admin.firstName} ${admin.lastName} now signs in as ${email}. ${ended.count} session(s) signed out.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => db.$disconnect());
