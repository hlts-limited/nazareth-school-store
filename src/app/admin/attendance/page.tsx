import Link from "next/link";
import { db } from "@/shared/lib/db";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Kpi, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { auditActor, requireStaff } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { sectionName } from "@/modules/hr";
import { attendanceSettings, closeDayAction, dayBoard, lagosDate, LEAVE_TYPES, manualClockAction, photoStats, weekday } from "@/modules/attendance";
import { STATUS_TONE, STATUS_WORD, timeOf } from "./_status";

export const metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

const Photo = ({ k, label }: { k: string | null; label: string }) => k
  // eslint-disable-next-line @next/next/no-img-element
  ? <a href={`/api/files/${k}`} target="_blank" rel="noreferrer" title={label}><img className="att-thumb" src={`/api/files/${k}`} alt={label} loading="lazy" /></a>
  : null;

export default async function AttendanceTodayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const v = await requireStaff("attendance.view.section");
  const sp = await searchParams;
  const today = lagosDate();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") && sp.day! <= today ? sp.day! : today;
  const manage = v.permissions.has("attendance.manage");
  const photos = v.permissions.has("attendance.photos");
  const own = manage ? null : (await db.employee.findUnique({ where: { userId: v.user.id }, select: { section: true } }))?.section ?? "none";
  const [board, s, stats] = await Promise.all([dayBoard(day, own), attendanceSettings(), photos ? photoStats() : null]);
  // Looking at the clock-in photos is recorded, once per page view
  if (photos && board.rows.some((r) => r.rec?.inPhotoKey || r.rec?.outPhotoKey)) {
    await audit(await auditActor(v), "Viewed attendance photos", "Attendance", null, { day, section: own ?? "all" });
  }
  const schoolDay = s.workDays.includes(weekday(day));
  const t = board.totals;
  const prev = new Date(`${day}T12:00:00Z`); prev.setUTCDate(prev.getUTCDate() - 1);
  const next = new Date(`${day}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return (
    <>
      <PageHeader title={day === today ? "Today" : new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
        sub={`${own ? sectionName(own) + " · " : ""}Late after ${s.lateCutoff}${board.holiday ? ` · Holiday: ${board.holiday.name}` : ""}${schoolDay ? "" : " · not a school day"}`}
        actions={<div className="row tight">
          <Link className="btn sm" href={`?day=${prev.toISOString().slice(0, 10)}`}>Previous day</Link>
          {day < today && <Link className="btn sm" href={`?day=${next.toISOString().slice(0, 10)}`}>Next day</Link>}
          {day !== today && <Link className="btn sm" href="/admin/attendance">Today</Link>}
        </div>} />
      <div className="stack">
        <div className="grid g4">
          <Kpi label="Staff" value={t.staff} />
          <Kpi label="On time" value={t.present} />
          <Kpi label="Late" value={t.late} tone={t.late ? "warn" : undefined} />
          <Kpi label={day === today ? "Not in yet" : "No record"} value={t.notIn} />
          <Kpi label="On leave / absent" value={`${t.leave} / ${t.absent}`} />
        </div>

        {stats && stats.overdue > 0 && <Note tone="warn" icon="alert">{stats.overdue} clock-in photo record{stats.overdue === 1 ? " is" : "s are"} older than 31 days and still waiting to be deleted. The nightly job retries them.</Note>}

        <section className="card pad-0">
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Staff</th><th>In</th><th>Out</th><th>Status</th>{photos && <th>Photos</th>}</tr></thead>
            <tbody>
              {!board.rows.length && <tr><td colSpan={5} className="empty">No active staff.</td></tr>}
              {board.rows.map(({ e, rec, leaveType }) => (
                <tr key={e.id}>
                  <td data-label="Staff"><b>{e.user.firstName} {e.user.lastName}</b><div className="small muted">{e.position} · {sectionName(e.section)}</div></td>
                  <td data-label="In">{timeOf(rec?.clockInAt ?? null)}{rec?.manualNote ? <span className="small muted" title={rec.manualNote}> (by hand)</span> : null}</td>
                  <td data-label="Out">{timeOf(rec?.clockOutAt ?? null)}</td>
                  <td data-label="Status">
                    {rec ? <Pill tone={STATUS_TONE[rec.status]}>{STATUS_WORD[rec.status]}</Pill>
                      : leaveType ? <Pill tone="info">{LEAVE_TYPES.find(([k]) => k === leaveType)?.[1] ?? "On leave"}</Pill>
                      : <span className="small muted">{day === today ? "Not in yet" : "No record"}</span>}
                  </td>
                  {photos && <td data-label="Photos"><div className="row tight nowrap"><Photo k={rec?.inPhotoKey ?? null} label="Clock-in photo" /><Photo k={rec?.outPhotoKey ?? null} label="Clock-out photo" />{rec?.photoDeletedAt ? <span className="small muted">Deleted after 31 days</span> : null}</div></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>

        {manage && (
          <div className="grid g2" style={{ alignItems: "start" }}>
            <ActionForm action={manualClockAction} className="card stack" resetOnSuccess>
              <h3>Clock someone in or out by hand</h3>
              <p className="small muted">For a phone problem or a staff member out on school duty. The reason is recorded and they see it on their page.</p>
              <div className="grid g2">
                <div className="field"><label htmlFor="mc-e">Staff</label><select className="input" id="mc-e" name="employeeId" defaultValue="">{[<option key="" value="" disabled>Choose…</option>, ...board.rows.map(({ e }) => <option key={e.id} value={e.id}>{e.user.firstName} {e.user.lastName}</option>)]}</select></div>
                <div className="field"><label htmlFor="mc-k">Clock</label><select className="input" id="mc-k" name="kind"><option value="in">In</option><option value="out">Out</option></select></div>
                <div className="field"><label htmlFor="mc-d">Day</label><input className="input" id="mc-d" type="date" name="day" defaultValue={day} max={today} /></div>
                <div className="field"><label htmlFor="mc-t">Time</label><input className="input" id="mc-t" type="time" name="time" /><FieldError name="time" /></div>
              </div>
              <div className="field"><label htmlFor="mc-r">Reason</label><input className="input" id="mc-r" name="reason" placeholder="e.g. Phone camera broken" /><FieldError name="reason" /></div>
              <div><SubmitButton size="sm">Save</SubmitButton></div>
            </ActionForm>
            <ActionForm action={closeDayAction} className="card stack">
              <h3>Close the day</h3>
              <p className="small muted">Marks everyone without a clock-in as absent, unless they are on approved leave or it is a holiday. Do this at the end of each school day; absences feed into payroll penalties.</p>
              <input type="hidden" name="day" value={day} />
              <div><SubmitButton size="sm" variant="default" disabled={!schoolDay} confirmText={`Close ${day}? Everyone without a clock-in will be marked absent.`}>Close {day === today ? "today" : day}</SubmitButton></div>
            </ActionForm>
          </div>
        )}
      </div>
    </>
  );
}
