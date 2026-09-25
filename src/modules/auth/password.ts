import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { SCHOOL } from "@/shared/config/school";

authenticator.options = { window: 1 }; // accept the previous/next 30-second code too

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string | null | undefined) => (hash ? bcrypt.compare(pw, hash) : Promise.resolve(false));

export const newTotpSecret = () => authenticator.generateSecret();
export const totpUri = (email: string, secret: string) => authenticator.keyuri(email, SCHOOL.storeName, secret);
export function verifyTotp(code: string, secret: string | null | undefined) {
  if (!secret) return false;
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  try { return authenticator.verify({ token: c, secret }); } catch { return false; }
}

/** At least 8 characters with a letter and a number */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use at least one letter and one number.";
  return null;
}
