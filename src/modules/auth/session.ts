import { cookies } from "next/headers";
import { cache } from "react";
import type { SessionKind } from "@prisma/client";
import { db } from "@/shared/lib/db";
import { randomToken, sha256 } from "@/shared/lib/crypto";
import { requestMeta, describeDevice } from "@/shared/lib/request";
import { isProd } from "@/shared/config/env";
import { getSettings } from "@/modules/settings";

export const SESSION_COOKIE = "naz_session";
export const VIEWAS_COOKIE = "naz_viewas";

type LimitKey = "PARENT" | "PUPIL" | "STAFF" | "ADMIN";

async function limitsFor(key: LimitKey) {
  const s = await getSettings();
  return s.sessionLimits[key];
}

/** Create a session, enforce the "devices at once" limit, and set the cookie. Call only from actions / route handlers. */
export async function createSession(kind: SessionKind, subject: { userId?: string; pupilId?: string }, opts: { remember?: boolean; isAdmin?: boolean } = {}) {
  const limitKey: LimitKey = kind === "STAFF" ? (opts.isAdmin ? "ADMIN" : "STAFF") : kind;
  const lim = await limitsFor(limitKey);
  const meta = await requestMeta();
  const now = Date.now();
  const remember = kind === "PARENT" && !!opts.remember;
  const maxMs = remember ? (lim as { rememberDays?: number }).rememberDays! * 86400_000 : lim.maxHours * 3600_000;

  // Devices at once: end the oldest sessions beyond the limit
  const active = await db.session.findMany({
    where: { kind, userId: subject.userId ?? undefined, pupilId: subject.pupilId ?? undefined, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: "asc" },
  });
  const excess = active.length - (lim.devices - 1);
  if (excess > 0) {
    await db.session.updateMany({ where: { id: { in: active.slice(0, excess).map((s) => s.id) } }, data: { revokedAt: new Date(), revokeReason: "Signed in on another device" } });
  }

  const token = randomToken();
  await db.session.create({
    data: {
      id: sha256(token), kind, userId: subject.userId, pupilId: subject.pupilId, remember,
      userAgent: meta.userAgent.slice(0, 300), ip: meta.ip, expiresAt: new Date(now + maxMs),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: isProd(), sameSite: "lax", path: "/",
    ...(remember ? { maxAge: Math.floor(maxMs / 1000) } : {}), // otherwise a browser-session cookie
  });
}


/** Reads and validates the current session (idle timeout + max length). Cached per request. */
export const readSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) } });
  if (!s || s.revokedAt) return null;
  return s;
});

/** Why this browser's session ended (another device, inactivity…), for the sign-in page. Null after a normal sign-out. */
export async function endedSessionReason() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) }, select: { revokedAt: true, revokeReason: true } });
  return s?.revokedAt && s.revokeReason && s.revokeReason !== "Signed out" ? s.revokeReason : null;
}

/** Checks idle/max limits; revokes and returns false if the session is over. Touches lastActiveAt (at most once a minute). */
export async function enforceLimits(s: NonNullable<Awaited<ReturnType<typeof readSession>>>, limitKey: LimitKey) {
  const lim = await limitsFor(limitKey);
  const now = Date.now();
  if (s.expiresAt.getTime() < now) {
    await db.session.update({ where: { id: s.id }, data: { revokedAt: new Date(), revokeReason: "Maximum session length reached" } });
    return false;
  }
  if (!s.remember && now - s.lastActiveAt.getTime() > lim.idleMinutes * 60_000) {
    await db.session.update({ where: { id: s.id }, data: { revokedAt: new Date(), revokeReason: "Signed out after inactivity" } });
    return false;
  }
  if (now - s.lastActiveAt.getTime() > 60_000) {
    await db.session.update({ where: { id: s.id }, data: { lastActiveAt: new Date() } });
  }
  return true;
}

export async function idleInfo(limitKey: LimitKey) {
  const lim = await limitsFor(limitKey);
  return { idleSeconds: lim.idleMinutes * 60 };
}

export async function destroyCurrentSession(reason = "Signed out") {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.updateMany({ where: { id: sha256(token), revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
  jar.delete(SESSION_COOKIE);
  jar.delete(VIEWAS_COOKIE);
}

/** End every session for a user — used after password, role or status changes. */
export async function revokeAllForUser(userId: string, reason: string) {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
}

export async function listActiveSessions() {
  const rows = await db.session.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastActiveAt: "desc" }, take: 200 });
  const userIds = rows.map((r) => r.userId).filter(Boolean) as string[];
  const pupilIds = rows.map((r) => r.pupilId).filter(Boolean) as string[];
  const [users, pupils] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, include: { roles: true } }),
    db.pupil.findMany({ where: { id: { in: pupilIds } } }),
  ]);
  return rows.map((r) => {
    const u = users.find((x) => x.id === r.userId);
    const p = pupils.find((x) => x.id === r.pupilId);
    return {
      id: r.id, kind: r.kind,
      name: u ? `${u.firstName} ${u.lastName}` : p ? `${p.firstName} ${p.lastName}` : "Unknown",
      role: r.kind === "STAFF" ? (u?.roles.map((x) => x.roleId).join(", ") ?? "staff") : r.kind.toLowerCase(),
      device: describeDevice(r.userAgent ?? ""), ip: r.ip, createdAt: r.createdAt, lastActiveAt: r.lastActiveAt,
    };
  });
}

export async function revokeSessionById(id: string, reason: string) {
  await db.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
}
