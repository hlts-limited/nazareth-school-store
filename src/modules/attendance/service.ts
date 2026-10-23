import type { AttendanceStatus, Prisma } from "@prisma/client";
import { BRANCHES, branchName } from "@/shared/config/school";
import { db } from "@/shared/lib/db";
import { UserError } from "@/shared/lib/action";
import { hmac, randomToken, safeEqual, sha256 } from "@/shared/lib/crypto";
import { storage } from "@/shared/lib/storage";
import { env } from "@/shared/config/env";
import { notify } from "@/modules/notifications";

// ---------- Settings ----------

export type AttendanceSettings = {
  /** Clock-ins after this time (Lagos, HH:MM) are late */
  lateCutoff: string;
  /** Older single school location (before branches). Read only: it stands in for the branches until HR sets them. */
  gps: { lat: number; lng: number; radiusM: number } | null;
  /** Each branch's location. Staff may clock in at any branch, within its `radiusM` metres. Empty = location not checked */
  branches: Branch[];
  /** rotating: a gate device shows a code that changes every 30 s; static: one printed code */
  qrMode: "rotating" | "static";
  photoRequired: boolean;
  /** Staff scan the gate QR code (off: they start from the app; no gate screen needed) */
  qrRequired: boolean;
  /** Check the phone is at the staff member's branch gate (needs branch locations set) */
  gpsRequired: boolean;
  /** What must be in the photo, shown to staff */
  photoSpot: string;
  /** School days: 1 = Monday … 7 = Sunday */
  workDays: number[];
  /** Bump to invalidate printed codes and the kiosk link */
  qrVersion: number;
  /** sha256 of the gate device's kiosk link token */
  kioskTokenHash: string | null;
};

export const DEFAULT_ATTENDANCE: AttendanceSettings = {
  lateCutoff: "07:45", gps: null, branches: [], qrMode: "rotating", photoRequired: true, qrRequired: true, gpsRequired: true, photoSpot: "the school sign at the main gate",
  workDays: [1, 2, 3, 4, 5], qrVersion: 1, kioskTokenHash: null,
};

const KEY = "attendance";

/** The school's branches, each with its own gate */
export { BRANCHES, branchName };
export type Branch = { id: string; name: string; lat: number; lng: number; radiusM: number };

export async function attendanceSettings(): Promise<AttendanceSettings> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  return { ...DEFAULT_ATTENDANCE, ...((row?.value ?? {}) as Partial<AttendanceSettings>) };
}

/** Where clock-ins are allowed: the branches, or the older single school location if no branch is set yet */
export function clockInPlaces(s: AttendanceSettings): Branch[] {
  if (s.branches?.length) return s.branches;
  return s.gps ? [{ id: "school", name: "the school", ...s.gps }] : [];
}

/** The nearest allowed place to a phone, and how far away it is */
export function nearestPlace(places: Branch[], pos: { lat: number; lng: number }) {
  return places.map((p) => ({ place: p, metres: metresBetween(p, pos) })).sort((a, z) => a.metres - z.metres)[0];
}

export async function saveAttendanceSettings(patch: Partial<AttendanceSettings>) {
  const value = { ...(await attendanceSettings()), ...patch };
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
  return value;
}

// ---------- Days and times (the school runs on Lagos time) ----------

/** "YYYY-MM-DD" of an instant in Lagos */
export const lagosDate = (d: Date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
/** "HH:MM" of an instant in Lagos */
export const lagosTime = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
/** A school day as stored (@db.Date) */
export const dayValue = (day: string) => new Date(`${day}T00:00:00Z`);
/** Monday = 1 … Sunday = 7, for a "YYYY-MM-DD" */
export const weekday = (day: string) => ((dayValue(day).getUTCDay() + 6) % 7) + 1;
/** A Lagos wall-clock time on a day, as an instant */
export const lagosInstant = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+01:00`);

// ---------- The gate QR code ----------
// rotating: "NZQ1.r.<window>.<sig>", window = 30-second slot; static: "NZQ1.s.<version>.<sig>"

const WINDOW_S = 30;
const qrSecret = (version: number) => hmac(env().SESSION_SECRET, `attendance-qr:v${version}`);

export async function currentGateCode(now = Date.now()) {
  const s = await attendanceSettings();
  if (s.qrMode === "static") return { code: `NZQ1.s.${s.qrVersion}.${hmac(qrSecret(s.qrVersion), `s:${s.qrVersion}`)}`, secondsLeft: null };
  const w = Math.floor(now / 1000 / WINDOW_S);
  return { code: `NZQ1.r.${w}.${hmac(qrSecret(s.qrVersion), `r:${w}`)}`, secondsLeft: WINDOW_S - (Math.floor(now / 1000) % WINDOW_S) };
}

/** Check 1: is this a genuine, current gate code? A rotating code is good for its 30 s and the 30 s after. */
export async function gateCodeValid(code: string, now = Date.now()) {
  const s = await attendanceSettings();
  const [tag, mode, n, sig] = code.trim().split(".");
  if (tag !== "NZQ1" || !sig) return false;
  if (mode === "s") return s.qrMode === "static" && Number(n) === s.qrVersion && safeEqual(sig, hmac(qrSecret(s.qrVersion), `s:${s.qrVersion}`));
  if (mode !== "r" || s.qrMode !== "rotating") return false;
  const w = Number(n), cur = Math.floor(now / 1000 / WINDOW_S);
  if (!Number.isInteger(w) || w > cur || w < cur - 1) return false;
  return safeEqual(sig, hmac(qrSecret(s.qrVersion), `r:${w}`));
}

/** A new link for the gate device. Any earlier link stops working. */
export async function newKioskLink() {
  const token = randomToken(24);
  await saveAttendanceSettings({ kioskTokenHash: sha256(token) });
  return `${env().APP_URL}/kiosk/${token}`;
}

export async function kioskTokenValid(token: string) {
  const s = await attendanceSettings();
  return !!s.kioskTokenHash && safeEqual(s.kioskTokenHash, sha256(token));
}

// ---------- Clocking in and out ----------

type Today = { day: string; record: Prisma.AttendanceGetPayload<object> | null };

async function todayFor(employeeId: string, now = new Date()): Promise<Today> {
  const day = lagosDate(now);
  return { day, record: await db.attendance.findUnique({ where: { employeeId_date: { employeeId, date: dayValue(day) } } }) };
}

/** What the next scan does for this person today: clock in, clock out, or nothing left to do. */
export async function nextClock(employeeId: string, now = new Date()) {
  const { record } = await todayFor(employeeId, now);
  if (!record?.clockInAt) return record && ["LEAVE", "HOLIDAY"].includes(record.status) ? null : "in";
  if (!record.clockOutAt) return "out";
  return null;
}

/** Check 1 passed → a single-use capture token for this person, valid for 60 seconds. */
export type Pos = { lat: number; lng: number; accuracy?: number };

export async function startCapture(employeeId: string, code: string | null, now = new Date(), pos?: Pos | null) {
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
  if (emp.status !== "ACTIVE") throw new UserError("Your staff record is not active.");
  if (!emp.attendanceConsentAt) throw new UserError("Please read and accept the notice about the photo and location first.");
  const s = await attendanceSettings();
  if (s.qrRequired !== false && !(code && (await gateCodeValid(code, now.getTime())))) throw new UserError("That code isn't the school's current gate code. Scan the code on the gate screen again.");
  const kind = await nextClock(employeeId, now);
  if (!kind) throw new UserError("You have already clocked in and out today.");
  // Where the phone is, checked straight away (and again when the clock-in is completed)
  if (pos) await checkPlace(employeeId, kind, pos, s, now);
  const t = await db.captureToken.create({ data: { employeeId, kind, expiresAt: new Date(now.getTime() + 60_000) } });
  return { token: t.id, kind, photoRequired: s.photoRequired };
}

const R = 6_371_000;
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- Where the phone is: branch check, blocked attempts and pattern flags ----------

/** Plain-words names for the pattern flags */
export const FLAG_WORDS: Record<string, string> = {
  repeated: "3 or more blocked tries in 14 days",
  "same-spot": "tried again from the same place outside the school",
  imprecise: "location was very imprecise (over 200 m)",
  "possible-fake-gps": "the location looks faked (a reading repeated exactly, or impossibly precise)",
};

/** The Alpha Admin and every Super Admin: they're told about blocked clock-ins */
async function overseers() {
  const alpha = env().ALPHA_ADMIN_EMAIL;
  return db.user.findMany({
    where: { type: "STAFF", status: "ACTIVE", OR: [{ roles: { some: { roleId: "admin" } } }, ...(alpha ? [{ email: { equals: alpha, mode: "insensitive" as const } }] : [])] },
    select: { id: true },
  });
}

const same6 = (a: number, b: number) => Math.round(a * 1e6) === Math.round(b * 1e6);

/** Patterns worth a closer look, from this attempt and the person's earlier ones */
async function patternFlags(employeeId: string, pos: Pos, now: Date) {
  const earlier = await db.clockAttempt.findMany({ where: { employeeId, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, select: { lat: true, lng: true, createdAt: true } });
  const flags: string[] = [];
  if (earlier.filter((a) => a.createdAt.getTime() >= now.getTime() - 14 * 86_400_000).length >= 2) flags.push("repeated");
  if (earlier.some((a) => a.lat != null && a.lng != null && metresBetween({ lat: a.lat, lng: a.lng }, pos) <= 100)) flags.push("same-spot");
  if (pos.accuracy != null && pos.accuracy > 200) flags.push("imprecise");
  const exactRepeat = earlier.some((a) => a.lat != null && a.lng != null && same6(a.lat, pos.lat) && same6(a.lng, pos.lng));
  if (exactRepeat || (pos.accuracy != null && pos.accuracy < 1)) flags.push("possible-fake-gps");
  return flags;
}

/** Saves a refused clock-in with where the phone was, and tells the Alpha and Super Admins (at most every 30 min per person) */
async function recordBlocked(employeeId: string, kind: "in" | "out", pos: Pos, info: { branch: string | null; metres: number | null; reason: string }, now: Date) {
  const flags = await patternFlags(employeeId, pos, now);
  const recent = await db.clockAttempt.count({ where: { employeeId, createdAt: { gte: new Date(now.getTime() - 30 * 60_000) } } });
  await db.clockAttempt.create({
    data: { employeeId, kind, lat: pos.lat, lng: pos.lng, accuracyM: pos.accuracy ?? null, distanceM: info.metres == null ? null : Math.round(info.metres), branch: info.branch, reason: info.reason, flags, createdAt: now },
  });
  if (recent > 0) return;
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { staffCode: true, user: { select: { firstName: true, lastName: true } } } });
  const who = emp ? `${emp.user.firstName} ${emp.user.lastName} (${emp.staffCode})` : "A member of staff";
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
  const where = `https://www.google.com/maps?q=${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
  const body = `${who} tried to clock ${kind} at ${time} and was blocked: ${info.reason}. Where the phone was: ${where}${pos.accuracy != null ? ` (accurate to about ${Math.round(pos.accuracy)} m)` : ""}.${flags.length ? ` Flags: ${flags.map((f) => FLAG_WORDS[f] ?? f).join("; ")}.` : ""} See Super Admin > Blocked clock-ins.`;
  for (const u of await overseers()) await notify(u.id, `Blocked clock-${kind}: ${emp?.user.firstName ?? "staff"}`, body, ["inapp", "whatsapp", "email"]);
}

/**
 * Is the phone at the branch this person is deployed to? Returns the branch name (or null when location isn't
 * checked). A refusal is recorded with where the phone was before the error is shown.
 */
async function checkPlace(employeeId: string, kind: "in" | "out", pos: Pos | null, s: AttendanceSettings, now: Date): Promise<string | null> {
  if (s.gpsRequired === false) return null;
  const all = clockInPlaces(s);
  if (!all.length) return null;
  if (!pos) throw new UserError("Turn on location for this site, then try again.");
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { branch: true } });
  let places = all;
  if (s.branches?.length) {
    // Branches are set up: only the person's own branch counts (no "any branch" fallback)
    const own = all.filter((p) => p.id === emp?.branch);
    if (!own.length) {
      const reason = emp?.branch ? `${branchName(emp.branch)} has no gate location set yet` : "no branch is set on their staff record";
      const near = nearestPlace(all, pos);
      await recordBlocked(employeeId, kind, pos, { branch: emp?.branch ?? null, metres: near?.metres ?? null, reason }, now);
      throw new UserError(emp?.branch
        ? `${branchName(emp.branch)}'s gate location hasn't been set yet, so you can't clock in from the app. Ask HR, or ask an administrator to clock you in.`
        : "Your branch isn't set on your staff record yet. Ask HR to set it, or ask an administrator to clock you in.");
    }
    places = own;
  }
  const near = nearestPlace(places, pos);
  if (near.metres > near.place.radiusM) {
    await recordBlocked(employeeId, kind, pos, { branch: near.place.id, metres: near.metres, reason: `about ${Math.round(near.metres)} m from ${near.place.name}` }, now);
    throw new UserError(s.branches?.length
      ? `You're deployed to ${near.place.name}, and you seem to be about ${Math.round(near.metres)} m from it. Clock in at ${near.place.name}. If you've been moved to another branch, ask HR to update your record.`
      : `You seem to be about ${Math.round(near.metres)} m from ${near.place.name}. Clock in at the school.`);
  }
  return near.place.name;
}

/** On a successful clock-in: the exact same GPS reading as on an earlier day suggests a location-faking app */
async function flagRepeatedReading(employeeId: string, pos: Pos | null, day: string) {
  if (!pos) return;
  const same = await db.attendance.findFirst({
    where: { employeeId, date: { not: dayValue(day) }, inLat: { gte: pos.lat - 5e-7, lte: pos.lat + 5e-7 }, inLng: { gte: pos.lng - 5e-7, lte: pos.lng + 5e-7 } },
    select: { date: true },
  });
  if (!same) return;
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { staffCode: true, user: { select: { firstName: true, lastName: true } } } });
  const body = `${emp?.user.firstName} ${emp?.user.lastName} (${emp?.staffCode}) clocked in today with exactly the same GPS reading as on ${same.date.toISOString().slice(0, 10)}. Real phones never repeat a reading to the last digit, so this may be a location-faking app. The clock-in was accepted; please check.`;
  for (const u of await overseers()) await notify(u.id, `Possible fake location: ${emp?.user.firstName ?? "staff"}`, body, ["inapp", "whatsapp", "email"]);
}

/** Blocked clock-ins for the Super Admin page, newest first */
export async function blockedAttempts(take = 200) {
  return db.clockAttempt.findMany({ orderBy: { createdAt: "desc" }, take, include: { employee: { select: { staffCode: true, branch: true, user: { select: { firstName: true, lastName: true } } } } } });
}

/**
 * Check 2: the photo comes back with an unused token issued to this person under 60 seconds ago, it is a real
 * image, and (if the school set a location) the phone is inside the school's radius. The time recorded is the
 * server's, never the photo's.
 */
export async function completeCapture(employeeId: string, tokenId: string, photo: { buf: Buffer; mime: string; ext: string } | null, pos: Pos | null, now = new Date()) {
  const s = await attendanceSettings();
  const t = await db.captureToken.findUnique({ where: { id: tokenId } });
  if (!t || t.employeeId !== employeeId || t.usedAt || t.expiresAt < now) throw new UserError("That took too long or the scan was already used. Scan the gate code again.");
  if (s.photoRequired && !photo) throw new UserError("Take the photo to finish clocking in.");
  if (photo && !photo.mime.startsWith("image/")) throw new UserError("That wasn't a photo from the camera. Please try again.");
  const at = await checkPlace(employeeId, t.kind as "in" | "out", pos, s, now);
  // Use the token once, even if two requests race
  const used = await db.captureToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: now } });
  if (!used.count) throw new UserError("That scan was already used. Scan the gate code again.");

  const day = lagosDate(now);
  let key: string | null = null;
  if (photo) {
    key = `attendance/${day}/${employeeId}-${t.kind}-${randomToken(6).replace(/[^a-zA-Z0-9]/g, "")}.${photo.ext}`;
    await storage().put(key, photo.buf, photo.mime);
  }
  const where = { employeeId_date: { employeeId, date: dayValue(day) } };
  if (t.kind === "in") {
    const late = lagosTime(now) > s.lateCutoff;
    const rec = await db.attendance.upsert({
      where,
      create: { employeeId, date: dayValue(day), status: late ? "LATE" : "PRESENT", clockInAt: now, inPhotoKey: key, inLat: pos?.lat, inLng: pos?.lng, qrVerified: s.qrRequired !== false },
      update: { status: late ? "LATE" : "PRESENT", clockInAt: now, inPhotoKey: key, inLat: pos?.lat, inLng: pos?.lng, qrVerified: s.qrRequired !== false },
    });
    if (at) await flagRepeatedReading(employeeId, pos, day);
    return { kind: "in" as const, record: rec, late, at };
  }
  const rec = await db.attendance.update({ where, data: { clockOutAt: now, outPhotoKey: key, outLat: pos?.lat, outLng: pos?.lng } });
  return { kind: "out" as const, record: rec, late: false, at };
}

export async function acceptNotice(employeeId: string) {
  return db.employee.update({ where: { id: employeeId }, data: { attendanceConsentAt: new Date() } });
}

/** HR or the Proprietor clock someone in or out by hand, with a reason. Logged, and shown on the person's page. */
export async function manualClock(employeeId: string, kind: "in" | "out", day: string, time: string, reason: string, by: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) throw new UserError("Enter the time as HH:MM.", { time: "HH:MM" });
  if (!reason.trim()) throw new UserError("Give a reason for the manual entry.", { reason: "Required" });
  const at = lagosInstant(day, time);
  if (at > new Date()) throw new UserError("That time is in the future.", { time: "In the future" });
  const s = await attendanceSettings();
  const where = { employeeId_date: { employeeId, date: dayValue(day) } };
  const existing = await db.attendance.findUnique({ where });
  const note = `${kind === "in" ? "In" : "Out"} ${time} by ${by}: ${reason.trim()}`;
  const manualNote = existing?.manualNote ? `${existing.manualNote}\n${note}` : note;
  let rec;
  if (kind === "in") {
    const status: AttendanceStatus = time > s.lateCutoff ? "LATE" : "PRESENT";
    rec = await db.attendance.upsert({ where, create: { employeeId, date: dayValue(day), status, clockInAt: at, manualNote, manualBy: by }, update: { status, clockInAt: at, manualNote, manualBy: by } });
  } else {
    if (!existing?.clockInAt) throw new UserError("Clock them in first.");
    rec = await db.attendance.update({ where, data: { clockOutAt: at, manualNote, manualBy: by } });
  }
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
  await notify(emp.userId, "Attendance entered by hand", `${note.replace(` by ${by}`, "")} (${day}). Entered by ${by}.`, ["inapp"]);
  return rec;
}

// ---------- Leave and holidays ----------

export const LEAVE_TYPES = [["annual", "Annual leave"], ["sick", "Sick leave"], ["maternity", "Maternity leave"], ["paternity", "Paternity leave"], ["compassionate", "Compassionate leave"], ["other", "Other"]] as const;

export async function requestLeave(employeeId: string, input: { type: string; from: string; to: string; reason?: string }) {
  if (!LEAVE_TYPES.some(([t]) => t === input.type)) throw new UserError("Choose the type of leave.", { type: "Required" });
  if (input.to < input.from) throw new UserError("The last day must be on or after the first day.", { to: "Before the first day" });
  const overlap = await db.leaveRequest.findFirst({ where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: dayValue(input.to) }, toDate: { gte: dayValue(input.from) } } });
  if (overlap) throw new UserError("You already have leave requested for some of those days.");
  return db.leaveRequest.create({ data: { employeeId, type: input.type, fromDate: dayValue(input.from), toDate: dayValue(input.to), reason: input.reason || null } });
}

export async function decideLeave(id: string, approve: boolean, note: string | undefined, by: { userId: string; name: string }) {
  const lr = await db.leaveRequest.findUniqueOrThrow({ where: { id }, include: { employee: true } });
  if (lr.employee.userId === by.userId) throw new UserError("You can't decide your own leave.");
  if (lr.status !== "PENDING") throw new UserError("This request has already been decided.");
  const updated = await db.leaveRequest.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedBy: by.name, decidedAt: new Date(), note: note || null } });
  if (approve) {
    // Days already closed as absent become leave
    await db.attendance.updateMany({ where: { employeeId: lr.employeeId, date: { gte: lr.fromDate, lte: lr.toDate }, status: "ABSENT" }, data: { status: "LEAVE" } });
  }
  await notify(lr.employee.userId, approve ? "Leave approved" : "Leave not approved",
    `Your leave from ${lr.fromDate.toISOString().slice(0, 10)} to ${lr.toDate.toISOString().slice(0, 10)} was ${approve ? "approved" : "not approved"}${note ? `: ${note}` : ""}.`, ["inapp"]);
  return updated;
}

export async function cancelLeave(id: string, employeeId: string) {
  const lr = await db.leaveRequest.findUniqueOrThrow({ where: { id } });
  if (lr.employeeId !== employeeId) throw new UserError("Not your request.");
  if (lr.status !== "PENDING") throw new UserError("Only a request still waiting can be cancelled. Ask HR.");
  return db.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
}

export async function addHoliday(day: string, name: string) {
  if (!name.trim()) throw new UserError("Name the holiday.", { name: "Required" });
  return db.holiday.upsert({ where: { date: dayValue(day) }, create: { date: dayValue(day), name: name.trim() }, update: { name: name.trim() } });
}

export const removeHoliday = (id: string) => db.holiday.delete({ where: { id } });

// ---------- Close day ----------

/**
 * Everyone active without a clock-in that day is marked absent, unless it isn't a school day, it's a holiday,
 * or they are on approved leave (then they are marked as such).
 */
export async function closeDay(day: string) {
  if (day > lagosDate()) throw new UserError("You can't close a day that hasn't happened yet.");
  const s = await attendanceSettings();
  const date = dayValue(day);
  if (!s.workDays.includes(weekday(day))) throw new UserError("That isn't a school day.");
  const holiday = await db.holiday.findUnique({ where: { date } });
  const staff = await db.employee.findMany({ where: { status: "ACTIVE", hireDate: { lte: date } }, select: { id: true } });
  const recorded = new Set((await db.attendance.findMany({ where: { date }, select: { employeeId: true } })).map((r) => r.employeeId));
  const leave = new Set((await db.leaveRequest.findMany({ where: { status: "APPROVED", fromDate: { lte: date }, toDate: { gte: date } }, select: { employeeId: true } })).map((r) => r.employeeId));
  const counts = { absent: 0, leave: 0, holiday: 0 };
  for (const e of staff) {
    if (recorded.has(e.id)) continue;
    const status: AttendanceStatus = holiday ? "HOLIDAY" : leave.has(e.id) ? "LEAVE" : "ABSENT";
    await db.attendance.create({ data: { employeeId: e.id, date, status } });
    counts[status === "HOLIDAY" ? "holiday" : status === "LEAVE" ? "leave" : "absent"]++;
  }
  return { absent: counts.absent, leave: counts.leave, holidayMarked: counts.holiday, holidayName: holiday?.name ?? null };
}

// ---------- Views ----------

/** Every active staff member with today's (or a day's) record. */
export async function dayBoard(day: string, onlySection?: string | null) {
  const date = dayValue(day);
  const [staff, holiday, leave] = await Promise.all([
    db.employee.findMany({
      where: { status: "ACTIVE", ...(onlySection ? { section: onlySection } : {}) },
      include: { user: { select: { firstName: true, lastName: true } }, attendance: { where: { date } } },
      orderBy: [{ section: "asc" }, { staffCode: "asc" }],
    }),
    db.holiday.findUnique({ where: { date } }),
    db.leaveRequest.findMany({ where: { status: "APPROVED", fromDate: { lte: date }, toDate: { gte: date } }, select: { employeeId: true, type: true } }),
  ]);
  const onLeave = new Map(leave.map((l) => [l.employeeId, l.type]));
  const rows = staff.map((e) => ({ e, rec: e.attendance[0] ?? null, leaveType: onLeave.get(e.id) ?? null }));
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  return {
    rows, holiday,
    totals: {
      staff: rows.length,
      present: count((r) => r.rec?.status === "PRESENT"), late: count((r) => r.rec?.status === "LATE"),
      notIn: count((r) => !r.rec && !r.leaveType), leave: count((r) => r.rec?.status === "LEAVE" || (!r.rec && !!r.leaveType)), absent: count((r) => r.rec?.status === "ABSENT"),
    },
  };
}

/** One person's records for a month ("YYYY-MM") */
export async function monthFor(employeeId: string, month: string) {
  const from = dayValue(`${month}-01`), to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
  return db.attendance.findMany({ where: { employeeId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } });
}

/** Totals per person for a month: the figures payroll uses for lateness and absence. */
export async function monthTotals(month: string) {
  const from = dayValue(`${month}-01`), to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
  const groups = await db.attendance.groupBy({ by: ["employeeId", "status"], where: { date: { gte: from, lte: to } }, _count: { _all: true } });
  const out = new Map<string, Record<AttendanceStatus, number>>();
  for (const g of groups) {
    const t = out.get(g.employeeId) ?? { PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0, HOLIDAY: 0 };
    t[g.status] = g._count._all;
    out.set(g.employeeId, t);
  }
  return out;
}

// ---------- Photo retention ----------

/** Nightly: delete every attendance photo older than 31 days. The record stays. Failures are retried next night. */
export async function purgeOldPhotos(now = new Date()) {
  const cutoff = dayValue(lagosDate(new Date(now.getTime() - 31 * 86400_000)));
  const rows = await db.attendance.findMany({ where: { date: { lt: cutoff }, photoDeletedAt: null, OR: [{ inPhotoKey: { not: null } }, { outPhotoKey: { not: null } }] }, take: 5000 });
  let deleted = 0, failed = 0;
  for (const r of rows) {
    try {
      for (const k of [r.inPhotoKey, r.outPhotoKey]) if (k) await storage().delete(k);
      await db.attendance.update({ where: { id: r.id }, data: { photoDeletedAt: now, inPhotoKey: null, outPhotoKey: null } });
      deleted++;
    } catch { failed++; }
  }
  return { deleted, failed };
}

export async function photoStats() {
  const cutoff = dayValue(lagosDate(new Date(Date.now() - 31 * 86400_000)));
  const [stored, overdue] = await Promise.all([
    db.attendance.count({ where: { OR: [{ inPhotoKey: { not: null } }, { outPhotoKey: { not: null } }] } }),
    db.attendance.count({ where: { date: { lt: cutoff }, OR: [{ inPhotoKey: { not: null } }, { outPhotoKey: { not: null } }] } }),
  ]);
  return { stored, overdue };
}
