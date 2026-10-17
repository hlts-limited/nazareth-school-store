import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Empty, Note, PageHeader } from "@/shared/ui/primitives";
import { db } from "@/shared/lib/db";
import { requireStaff } from "@/modules/auth";
import { acceptNoticeAction, attendanceSettings, ClockIn, completeClockAction, dayValue, lagosDate, nextClock, scanGateCodeAction } from "@/modules/attendance";
import { timeOf } from "../../attendance/_status";

export const metadata = { title: "Clock in / out" };
export const dynamic = "force-dynamic";

export default async function ClockPage() {
  const v = await requireStaff("self.service");
  const e = await db.employee.findUnique({ where: { userId: v.user.id } });
  if (!e) return <><PageHeader title="Clock in / out" /><div className="card"><Empty title="No staff record yet">HR hasn&apos;t registered you as a member of staff.</Empty></div></>;
  const [s, next, today] = await Promise.all([
    attendanceSettings(), nextClock(e.id), db.attendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date: dayValue(lagosDate()) } } }),
  ]);
  const done = today?.status === "LEAVE" ? "You're on leave today." : today?.status === "HOLIDAY" ? "Today is a holiday." : "You've clocked in and out today. See you tomorrow.";
  return (
    <div style={{ maxWidth: 520 }}>
      <PageHeader title="Clock in / out" sub={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" })} />
      <div className="stack">
        {!e.attendanceConsentAt ? (
          <section className="card stack">
            <h3>Before your first clock-in</h3>
            <p>When you clock in or out, the app takes a photo of {s.photoSpot}{s.gps ? " and checks your location" : ""} to confirm you are at the school.</p>
            <ul className="small">
              <li>Only HR and the Proprietor can see the photos, and every look is recorded.</li>
              <li>Photos are deleted automatically after 31 days. Your clock times stay for payroll.</li>
              {s.gps && <li>Your location is only checked at the moment you clock in or out. It is never tracked.</li>}
            </ul>
            <p className="small muted">Nigeria Data Protection Act 2023.</p>
            <ActionForm action={acceptNoticeAction}><SubmitButton icon="check">I understand, continue</SubmitButton></ActionForm>
          </section>
        ) : next ? (
          <ClockIn scan={scanGateCodeAction} complete={completeClockAction} next={next} photoSpot={s.photoSpot} needGps={!!s.gps} />
        ) : (
          <Note tone="ok" icon="check">{done}</Note>
        )}
        {today && (today.clockInAt || today.clockOutAt) && (
          <section className="card">
            <dl className="facts">
              <div><dt>Clocked in</dt><dd>{timeOf(today.clockInAt)}{today.status === "LATE" ? " (late)" : ""}</dd></div>
              <div><dt>Clocked out</dt><dd>{timeOf(today.clockOutAt)}</dd></div>
            </dl>
            {today.manualNote && <p className="small muted">Entered by hand: {today.manualNote}</p>}
          </section>
        )}
        <p className="small muted">Late after {s.lateCutoff}. Can&apos;t scan? Ask HR to clock you in by hand with a reason.</p>
      </div>
    </div>
  );
}
