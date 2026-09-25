"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/shared/lib/db";
import { fail, ok, parseForm, runAction, zText, type ActionResult, UserError } from "@/shared/lib/action";
import { normalizePhone } from "@/shared/lib/format";
import { requestMeta } from "@/shared/lib/request";
import { isProd } from "@/shared/config/env";
import { ROLE_DEFS } from "@/modules/access-control";
import { audit } from "@/modules/audit";
import { getSettings } from "@/modules/settings";
import { hashPassword, passwordProblem, verifyPassword, verifyTotp } from "./password";
import { CAPTCHA_AFTER, checkCaptcha, isLocked, recentFailures, recordAttempt } from "./rate-limit";
import { createSession, destroyCurrentSession, revokeAllForUser, revokeSessionById, VIEWAS_COOKIE } from "./session";
import { auditActor, getViewAs, getViewer, staffFor } from "./current";

const LOCKED_MSG = "Too many attempts. This login is locked for 15 minutes.";

export async function loginParent(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const d = parseForm(z.object({ id: zText(120, "Enter your phone number or email"), password: zText(200, "Enter your password"), remember: z.string().optional() }), form);
    const { ip } = await requestMeta();
    const idKey = `parent:${d.id.toLowerCase()}`;
    if ((await isLocked(idKey)) || (await isLocked(`ip:${ip}`))) return fail(LOCKED_MSG);
    const phone = normalizePhone(d.id);
    const user = await db.user.findFirst({ where: { type: "PARENT", status: "ACTIVE", OR: [{ email: d.id.toLowerCase() }, ...(phone ? [{ phone }] : [])] } });
    if (!user || !(await verifyPassword(d.password, user.passwordHash))) {
      await recordAttempt(idKey, false); await recordAttempt(`ip:${ip}`, false);
      return fail("That phone/email and password don't match.");
    }
    await recordAttempt(idKey, true);
    await createSession("PARENT", { userId: user.id }, { remember: d.remember === "on" });
    await audit({ id: user.id, name: `${user.firstName} ${user.lastName}`, role: "Parent", ip }, "Signed in", "Session");
    return ok(undefined, { redirect: "/home" });
  });
}

export async function loginPupil(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const d = parseForm(z.object({
      surname: zText(80, "Enter the pupil's surname"),
      reg: zText(40, "Enter the registration number"),
      pin: z.string().optional(),
      captcha: z.string().optional(), captchaToken: z.string().optional(),
    }), form);
    const { ip } = await requestMeta();
    const reg = d.reg.trim().toUpperCase();
    const key = `pupil:${reg}`;
    const ipKey = `pupil-ip:${ip}`;
    if (await isLocked(key)) return fail(LOCKED_MSG);
    if ((await recentFailures(ipKey)) >= CAPTCHA_AFTER) {
      if (!d.captcha || !d.captchaToken || !checkCaptcha(d.captcha, d.captchaToken)) return fail("Please answer the check question.", { captcha: "Answer the sum" });
    }
    const pupil = await db.pupil.findFirst({ where: { regNumber: reg, lastName: { equals: d.surname.trim(), mode: "insensitive" }, status: "ACTIVE", deletedAt: null } });
    const pinOk = !pupil?.pinHash || (d.pin ? await verifyPassword(d.pin, pupil.pinHash) : false);
    if (!pupil || !pinOk) {
      await recordAttempt(key, false); await recordAttempt(ipKey, false);
      const left = Math.max(0, 5 - (await recentFailures(key)));
      return fail(pupil && !pinOk ? "Enter the PIN your parent set." : `Surname or reg number is not correct. ${left} attempt${left === 1 ? "" : "s"} left.`);
    }
    await recordAttempt(key, true); await recordAttempt(ipKey, true);
    await createSession("PUPIL", { pupilId: pupil.id });
    await audit({ id: pupil.id, name: `${pupil.firstName} ${pupil.lastName}`, role: "Pupil", ip }, "Signed in", "Session");
    return ok(undefined, { redirect: "/pupil" });
  });
}

export async function loginStaff(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const d = parseForm(z.object({ email: zText(120, "Enter your email"), password: zText(200, "Enter your password"), code: z.string().optional() }), form);
    const { ip } = await requestMeta();
    const key = `staff:${d.email.toLowerCase()}`;
    if ((await isLocked(key)) || (await isLocked(`ip:${ip}`))) return fail(LOCKED_MSG);
    const user = await db.user.findFirst({ where: { type: "STAFF", status: "ACTIVE", email: d.email.toLowerCase() }, include: { roles: true } });
    if (!user || !(await verifyPassword(d.password, user.passwordHash))) {
      await recordAttempt(key, false); await recordAttempt(`ip:${ip}`, false);
      return fail("That email and password don't match.");
    }
    const roles = user.roles.map((r) => r.roleId);
    const needs2fa = !!user.totpSecret || ROLE_DEFS.some((r) => roles.includes(r.id) && r.requires2fa);
    if (needs2fa) {
      if (!user.totpSecret) return fail("Two-factor authentication must be set up for your account. Ask the Super Admin for a new invite link.");
      if (!d.code) return fail("Enter the 6-digit code from your authenticator app.", { code: "Required for your role" });
      if (!verifyTotp(d.code, user.totpSecret)) { await recordAttempt(key, false); return fail("That code is not correct.", { code: "Code not correct" }); }
    }
    await recordAttempt(key, true);
    await createSession("STAFF", { userId: user.id }, { isAdmin: roles.includes("admin") });
    await audit({ id: user.id, name: `${user.firstName} ${user.lastName}`, role: roles.join(", "), ip }, "Signed in", "Session");
    return ok(undefined, { redirect: "/admin" });
  });
}

export async function logout() {
  const v = await getViewer();
  if (v) await audit(await auditActor(v), "Signed out", "Session");
  await destroyCurrentSession();
  redirect("/login");
}

/** Called by the idle watcher so active users aren't signed out. */
export async function keepAlive(): Promise<{ ok: boolean }> {
  const v = await getViewer(); // getViewer touches lastActiveAt
  return { ok: !!v };
}

// ---------- Invites (parents and staff set their own password) ----------
export async function acceptInvite(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const d = parseForm(z.object({ token: zText(200), password: z.string(), confirm: z.string(), code: z.string().optional(), consent: z.string().optional() }), form);
    const user = await db.user.findUnique({ where: { inviteToken: d.token } });
    if (!user || !user.inviteExpiresAt || user.inviteExpiresAt < new Date()) return fail("This invite link has expired. Ask the school office for a new one.");
    const problem = passwordProblem(d.password);
    if (problem) return fail(problem, { password: problem });
    if (d.password !== d.confirm) return fail("The two passwords don't match.", { confirm: "Doesn't match" });
    if (user.type === "PARENT" && d.consent !== "on") return fail("Please agree to the privacy notice to continue.", { consent: "Required" });
    if (user.type === "STAFF" && user.totpSecret && !verifyTotp(d.code ?? "", user.totpSecret)) return fail("Scan the QR code, then enter the 6-digit code from the app.", { code: "Code not correct" });
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(d.password), status: "ACTIVE", inviteToken: null, inviteExpiresAt: null, consentAt: user.type === "PARENT" ? new Date() : user.consentAt },
    });
    await revokeAllForUser(user.id, "Password changed");
    const { ip } = await requestMeta();
    await audit({ id: user.id, name: `${user.firstName} ${user.lastName}`, role: user.type === "PARENT" ? "Parent" : "Staff", ip }, "Accepted invite", "User", user.id);
    return ok("Password set. You can sign in now.", { redirect: "/login" + (user.type === "STAFF" ? "?tab=staff" : "") });
  });
}

// ---------- View-as ----------
export async function startViewAs(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await staffFor("viewas.use");
    const d = parseForm(z.object({ target: zText(100), reason: zText(200, "Choose a reason"), code: zText(10, "Enter your 2FA code") }), form);
    if (!verifyTotp(d.code, admin.user.totpSecret)) return fail("That 2FA code is not correct.", { code: "Code not correct" });
    const [kind, id] = d.target.split(":");
    if (kind !== "parent" && kind !== "pupil") throw new UserError("Invalid target");
    const exists = kind === "parent" ? await db.user.findFirst({ where: { id, type: "PARENT" } }) : await db.pupil.findUnique({ where: { id } });
    if (!exists) throw new UserError("That person no longer exists.");
    const s = await getSettings();
    const row = await db.viewAsSession.create({
      data: { adminId: admin.user.id, sessionId: admin.session.id, targetKind: kind, targetId: id, reason: d.reason, expiresAt: new Date(Date.now() + s.sessionLimits.VIEW_AS.maxMinutes * 60_000) },
    });
    (await cookies()).set(VIEWAS_COOKIE, row.id, { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: s.sessionLimits.VIEW_AS.maxMinutes * 60 });
    await audit(await auditActor(admin), "Started view-as", kind === "parent" ? "User" : "Pupil", id, { reason: d.reason });
    return ok(undefined, { redirect: kind === "parent" ? "/home" : "/pupil" });
  });
}

export async function endViewAs() {
  const v = await getViewer();
  const va = await getViewAs();
  if (va) {
    await db.viewAsSession.update({ where: { id: va.id }, data: { endedAt: new Date() } });
    if (v) await audit(await auditActor(v), "Ended view-as", va.targetKind === "parent" ? "User" : "Pupil", va.targetId);
  }
  (await cookies()).delete(VIEWAS_COOKIE);
  redirect("/admin/people");
}

export async function forceSignOut(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await staffFor("sessions.manage");
    const id = String(form.get("id") ?? "");
    await revokeSessionById(id, "Signed out by Super Admin");
    await audit(await auditActor(admin), "Forced sign-out", "Session", id.slice(0, 12));
    return ok("Session ended.");
  });
}
