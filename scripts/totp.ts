/* Show the current 2FA code for a staff account (for first-time set-up and testing).
 *   npm run totp -- admin@yourschool.com.ng
 */
import { PrismaClient } from "@prisma/client";
import { authenticator } from "otplib";

const email = (process.argv[2] ?? "").toLowerCase();
const db = new PrismaClient();

(async () => {
  if (!email) { console.log("Usage: npm run totp -- <staff email>"); process.exit(1); }
  const u = await db.user.findUnique({ where: { email } });
  if (!u?.totpSecret) { console.log("No 2FA secret for that email."); process.exit(1); }
  console.log(`Current code for ${email}: ${authenticator.generate(u.totpSecret)}  (changes every 30 seconds)`);
  console.log(`Authenticator app set-up key: ${u.totpSecret}`);
  await db.$disconnect();
})();
