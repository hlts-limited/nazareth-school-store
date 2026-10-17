import Link from "next/link";
import { fmtDate } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Empty, Kpi, PageHeader, Pill } from "@/shared/ui/primitives";
import { db } from "@/shared/lib/db";
import { requireStaff } from "@/modules/auth";
import { cancelLeaveAction, lagosDate, LEAVE_TYPES, monthFor, requestLeaveAction } from "@/modules/attendance";
import { STATUS_TONE, STATUS_WORD, timeOf } from "../../attendance/_status";

export const metadata = { title: "My attendance & leave" };

const LEAVE_TONE = { PENDING: "warn", APPROVED: "ok", REJECTED: "err", CANCELLED: "plain" } as const;
const shift = (m: string, by: number) => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + by); return d.toISOString().slice(0, 7); };

export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const v = await requireStaff("self.service");
  const e = await db.employee.findUnique({ where: { userId: v.user.id } });
  if (!e) return <><PageHeader title="My attendance & leave" /><div className="card"><Empty title="No staff record yet">HR hasn&apos;t registered you as a member of staff.</Empty></div></>;
  const sp = await searchParams;
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : lagosDate().slice(0, 7);
  const [rows, leave] = await Promise.all([monthFor(e.id, m), db.leaveRequest.findMany({ where: { employeeId: e.id }, orderBy: { fromDate: "desc" }, take: 20 })]);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const label = new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="My attendance & leave" sub={label}
        actions={<div className="row tight"><Link className="btn sm" href={`?m=${shift(m, -1)}`}>Previous month</Link>{m < lagosDate().slice(0, 7) && <Link className="btn sm" href={`?m=${shift(m, 1)}`}>Next month</Link>}</div>} />
      <div className="detail-grid">
        <div className="stack">
          <div className="grid g4">
            <Kpi label="On time" value={count("PRESENT")} />
            <Kpi label="Late" value={count("LATE")} />
            <Kpi label="Absent" value={count("ABSENT")} />
            <Kpi label="On leave" value={count("LEAVE")} />
          </div>
          <section className="card pad-0">
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>Day</th><th>In</th><th>Out</th><th>Status</th></tr></thead>
              <tbody>
                {!rows.length && <tr><td colSpan={4} className="empty">Nothing recorded this month.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Day">{fmtDate(r.date)}</td>
                    <td data-label="In">{timeOf(r.clockInAt)}</td>
                    <td data-label="Out">{timeOf(r.clockOutAt)}</td>
                    <td data-label="Status"><Pill tone={STATUS_TONE[r.status]}>{STATUS_WORD[r.status]}</Pill>{r.manualNote ? <div className="small muted">By hand: {r.manualNote}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>
        </div>
        <aside className="stack">
          <ActionForm action={requestLeaveAction} className="card stack" resetOnSuccess>
            <h3>Request leave</h3>
            <div className="field"><label htmlFor="lv-t">Type</label><select className="input" id="lv-t" name="type" defaultValue="annual">{LEAVE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><FieldError name="type" /></div>
            <div className="grid g2">
              <div className="field"><label htmlFor="lv-f">First day</label><input className="input" id="lv-f" type="date" name="from" /><FieldError name="from" /></div>
              <div className="field"><label htmlFor="lv-to">Last day</label><input className="input" id="lv-to" type="date" name="to" /><FieldError name="to" /></div>
            </div>
            <div className="field"><label htmlFor="lv-r">Reason (optional)</label><input className="input" id="lv-r" name="reason" /></div>
            <div><SubmitButton size="sm">Send request</SubmitButton></div>
          </ActionForm>
          <section className="card stack">
            <h3>My requests</h3>
            {!leave.length ? <p className="small muted">None yet.</p> : (
              <ul className="plain-list">
                {leave.map((l) => (
                  <li key={l.id} className="stack tight">
                    <div className="row between"><b className="small">{LEAVE_TYPES.find(([k]) => k === l.type)?.[1]}</b><Pill tone={LEAVE_TONE[l.status]}>{l.status.charAt(0) + l.status.slice(1).toLowerCase()}</Pill></div>
                    <span className="small muted">{fmtDate(l.fromDate)} to {fmtDate(l.toDate)}{l.note ? ` · ${l.note}` : ""}</span>
                    {l.status === "PENDING" && <ActionForm action={cancelLeaveAction}><input type="hidden" name="id" value={l.id} /><SubmitButton size="sm" variant="ghost">Cancel request</SubmitButton></ActionForm>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
