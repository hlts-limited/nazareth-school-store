"use server";

import { z } from "zod";
import { fail, ok, parseForm, runAction, zOptText, zText, type ActionResult } from "@/shared/lib/action";
import { db } from "@/shared/lib/db";
import { readUpload } from "@/shared/lib/storage";
import { auditActor, staffFor, type StaffViewer } from "@/modules/auth";
import { audit } from "@/modules/audit";
import {
  acceptNotice, addHoliday, attendanceSettings, cancelLeave, closeDay, completeCapture, decideLeave, lagosDate, manualClock, newKioskLink, removeHoliday, requestLeave,
  saveAttendanceSettings, startCapture,
} from "./service";

const zDay = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const name = (v: StaffViewer) => `${v.user.firstName} ${v.user.lastName}`;

async function myEmployee(v: StaffViewer) {
  const e = await db.employee.findUnique({ where: { userId: v.user.id } });
  if (!e) throw new Error("NO_RECORD");
  return e;
}

// ---------- Staff: clock in and out ----------

export async function acceptNoticeAction(): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("self.service");
    let e; try { e = await myEmployee(v); } catch { return fail("You don't have a staff record yet. Ask HR."); }
    await acceptNotice(e.id);
    await audit(await auditActor(v), "Accepted attendance photo and location notice", "Employee", e.id, { staffCode: e.staffCode });
    return ok("Thank you. You can clock in now.");
  });
}

/** Check 1: the scanned gate code. Returns a 60-second capture token. Called by the scanner, not a form. */
export async function scanGateCodeAction(code: string): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("self.service");
    let e; try { e = await myEmployee(v); } catch { return fail("You don't have a staff record yet. Ask HR."); }
    const r = await startCapture(e.id, code);
    return { ok: true, data: r };
  });
}

/** Check 2: the live photo (and location) with the capture token. */
export async function completeClockAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("self.service");
    let e; try { e = await myEmployee(v); } catch { return fail("You don't have a staff record yet. Ask HR."); }
    const file = form.get("photo") as File | null;
    let photo = null;
    if (file && file.size) {
      const up = await readUpload(file, { allowPdf: false });
      if ("error" in up) return fail("That wasn't a photo from the camera. Please try again.");
      photo = { buf: up.buf, mime: up.mime, ext: up.ext };
    }
    const lat = Number(form.get("lat")), lng = Number(form.get("lng"));
    const pos = form.get("lat") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    const r = await completeCapture(e.id, String(form.get("token") ?? ""), photo, pos);
    await audit(await auditActor(v), r.kind === "in" ? "Clocked in" : "Clocked out", "Attendance", r.record.id, { staffCode: e.staffCode, late: r.late, gps: !!pos });
    const t = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
    return ok(r.kind === "in" ? `Clocked in at ${t}${r.late ? " (late)" : ""}.` : `Clocked out at ${t}. Have a good evening.`, { data: { kind: r.kind, late: r.late, at: t } });
  });
}

// ---------- Staff: leave ----------

export async function requestLeaveAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("self.service");
    let e; try { e = await myEmployee(v); } catch { return fail("You don't have a staff record yet. Ask HR."); }
    const d = parseForm(z.object({ type: zText(20, "Choose the type of leave"), from: zDay("Choose the first day"), to: zDay("Choose the last day"), reason: zOptText(300) }), form);
    const lr = await requestLeave(e.id, d);
    await audit(await auditActor(v), "Requested leave", "LeaveRequest", lr.id, { staffCode: e.staffCode, type: d.type, from: d.from, to: d.to });
    return ok("Leave requested. You'll see the decision here.");
  });
}

export async function cancelLeaveAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("self.service");
    let e; try { e = await myEmployee(v); } catch { return fail("You don't have a staff record yet."); }
    await cancelLeave(String(form.get("id")), e.id);
    return ok("Leave request cancelled.");
  });
}

// ---------- HR and the Proprietor ----------

export async function manualClockAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("attendance.manage");
    const d = parseForm(z.object({ employeeId: zText(100), kind: z.enum(["in", "out"]), day: zDay("Choose the day"), time: zText(5, "Enter the time"), reason: zText(200, "Give a reason") }), form);
    const target = await db.employee.findUniqueOrThrow({ where: { id: d.employeeId } });
    if (target.userId === v.user.id) return fail("You can't clock yourself in by hand. Ask another member of HR or the Proprietor.");
    const rec = await manualClock(d.employeeId, d.kind, d.day, d.time, d.reason, name(v));
    await audit(await auditActor(v), d.kind === "in" ? "Manual clock-in" : "Manual clock-out", "Attendance", rec.id, { staffCode: target.staffCode, day: d.day, time: d.time, reason: d.reason });
    return ok(`Clocked ${d.kind} at ${d.time}. They can see this on their page.`);
  });
}

export async function closeDayAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("attendance.manage");
    const day = String(form.get("day") || lagosDate());
    const r = await closeDay(day);
    await audit(await auditActor(v), "Closed attendance day", "Attendance", null, { day, ...r });
    if (r.holidayName) return ok(`${day} is a holiday (${r.holidayName}): recorded for ${r.holidayMarked} staff.`);
    return ok(`Day closed: ${r.absent} absent, ${r.leave} on leave.`);
  });
}

export async function decideLeaveAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("attendance.manage");
    const d = parseForm(z.object({ id: zText(100), decision: z.enum(["approve", "reject"]), note: zOptText(300) }), form);
    const lr = await decideLeave(d.id, d.decision === "approve", d.note, { userId: v.user.id, name: name(v) });
    await audit(await auditActor(v), d.decision === "approve" ? "Approved leave" : "Rejected leave", "LeaveRequest", lr.id, { note: d.note });
    return ok(d.decision === "approve" ? "Leave approved." : "Leave not approved.");
  });
}

export async function saveAttendanceSettingsAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("attendance.manage");
    const d = parseForm(z.object({
      lateCutoff: z.string().regex(/^\d{2}:\d{2}$/, "Enter a time like 07:45"),
      qrMode: z.enum(["rotating", "static"]), photoRequired: z.string().optional(), photoSpot: zText(120, "Say what must be in the photo"),
      lat: z.string().optional(), lng: z.string().optional(), radiusM: z.string().optional(),
      workDays: z.union([z.string(), z.array(z.string())]).optional(),
    }), form);
    const lat = Number(d.lat), lng = Number(d.lng), radius = Number(d.radiusM) || 150;
    const gps = d.lat && d.lng && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, radiusM: Math.max(30, Math.min(2000, radius)) } : null;
    const workDays = (Array.isArray(d.workDays) ? d.workDays : d.workDays ? [d.workDays] : []).map(Number).filter((n) => n >= 1 && n <= 7);
    if (!workDays.length) return fail("Choose the school days.", { workDays: "Choose at least one" });
    const s = await saveAttendanceSettings({ lateCutoff: d.lateCutoff, qrMode: d.qrMode, photoRequired: d.photoRequired === "on", photoSpot: d.photoSpot, gps, workDays });
    await audit(await auditActor(v), "Changed attendance settings", "Setting", "attendance", { lateCutoff: s.lateCutoff, qrMode: s.qrMode, photoRequired: s.photoRequired, gps: !!s.gps, radiusM: s.gps?.radiusM, workDays: s.workDays });
    return ok("Attendance settings saved.");
  });
}

export async function newKioskLinkAction(): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("attendance.manage");
    const link = await newKioskLink();
    await audit(await auditActor(v), "Created gate screen link", "Setting", "attendance");
    return { ok: true, message: "New gate screen link ready. Open it on the gate device; any earlier link has stopped working.", data: { link } };
  });
}

export async function retirePrintedCodeAction(): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("attendance.manage");
    const s = await attendanceSettings();
    await saveAttendanceSettings({ qrVersion: s.qrVersion + 1, kioskTokenHash: null });
    await audit(await auditActor(v), "Replaced gate codes", "Setting", "attendance", { qrVersion: s.qrVersion + 1 });
    return ok("All earlier codes, printed or on screen, have stopped working. Print the new code or open a new gate screen link.");
  });
}

export async function addHolidayAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("attendance.manage");
    const d = parseForm(z.object({ day: zDay("Choose the date"), name: zText(80, "Name the holiday") }), form);
    const h = await addHoliday(d.day, d.name);
    await audit(await auditActor(v), "Added holiday", "Holiday", h.id, d);
    return ok(`${d.name} added.`);
  });
}

export async function removeHolidayAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const v = await staffFor("attendance.manage");
    const h = await removeHoliday(String(form.get("id")));
    await audit(await auditActor(v), "Removed holiday", "Holiday", h.id, { name: h.name });
    return ok("Holiday removed.");
  });
}
