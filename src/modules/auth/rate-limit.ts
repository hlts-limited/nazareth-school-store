import { db } from "@/shared/lib/db";
import { env } from "@/shared/config/env";
import { hmac, safeEqual } from "@/shared/lib/crypto";

const WINDOW_MS = 5 * 60 * 1000; // failures older than this no longer count, so a lock lasts 5 minutes
export const LOCK_AFTER = 5;
export const CAPTCHA_AFTER = 3;
/** Pupil sign-in from one connection: generous, because a whole class may share the school's Wi-Fi */
export const PUPIL_IP_LOCK_AFTER = 20;

export async function recentFailures(key: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const lastSuccess = await db.loginAttempt.findFirst({ where: { key, success: true, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
  return db.loginAttempt.count({ where: { key, success: false, createdAt: { gte: lastSuccess?.createdAt ?? since } } });
}

export async function recordAttempt(key: string, success: boolean) {
  await db.loginAttempt.create({ data: { key, success } });
}

export async function isLocked(key: string) {
  return (await recentFailures(key)) >= LOCK_AFTER;
}

// ---- Simple arithmetic check shown after repeated failures (no third-party service) ----
export function makeCaptcha() {
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 1 + Math.floor(Math.random() * 9);
  const exp = Date.now() + 10 * 60 * 1000;
  return { question: `What is ${a} + ${b}?`, token: `${exp}.${hmac(env().SESSION_SECRET, `${a + b}.${exp}`)}` };
}

/**
 * Checks the answer, and uses the question up: each question can be tried once, right or wrong, so an answer
 * can't be replayed and a script can't try every number on the same question.
 */
export async function checkCaptcha(answer: string, token: string) {
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !sig || !/^[\w-]+$/.test(sig)) return false;
  const key = `captcha:${sig}`;
  if (await db.loginAttempt.findFirst({ where: { key } })) return false;
  await db.loginAttempt.create({ data: { key, success: true } });
  return safeEqual(sig, hmac(env().SESSION_SECRET, `${answer.trim()}.${exp}`));
}
