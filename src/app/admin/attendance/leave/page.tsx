import Link from "next/link";
import { db } from "@/shared/lib/db";
import { fmtDate } from "@/shared/lib/format";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Empty, PageHeader, Pill } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { decideLeaveAction, LEAVE_TYPES } from "@/modules/attendance";

export const metadata = { title: "Leave requests" };

const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400_000) + 1;
const typeName = (t: string) => LEAVE_TYPES.find(([k]) => k === t)?.[1] ?? t;

export default async function LeavePage() {
  const v = await requireStaff("attendance.view.section");
  const manage = v.permissions.has("attendance.manage");
  const own = manage ? null : (await db.employee.findUnique({ where: { userId: v.user.id }, select: { section: true } }))?.section ?? "none";
  const scope = own ? { employee: { section: own } } : {};
  const [pending, recent] = await Promise.all([
    db.leaveRequest.findMany({ where: { status: "PENDING", ...scope }, include: { employee: { include: { user: true } } }, orderBy: { fromDate: "asc" } }),
    db.leaveRequest.findMany({ where: { status: { in: ["APPROVED", "REJECTED"] }, ...scope }, include: { employee: { include: { user: true } } }, orderBy: { decidedAt: "desc" }, take: 30 }),
  ]);
  return (
    <>
      <PageHeader title="Leave requests" sub="Approved leave is never counted as absence, so it never leads to a penalty." />
      <div className="stack">
        <section className="card pad-0">
          <div className="card-h"><h3>Waiting for a decision ({pending.length})</h3></div>
          {!pending.length ? <Empty title="Nothing waiting">New requests appear here.</Empty> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>Staff</th><th>Leave</th><th>Days</th><th>Reason</th><th /></tr></thead>
              <tbody>{pending.map((l) => (
                <tr key={l.id}>
                  <td data-label="Staff"><Link href={`/admin/hr/${l.employeeId}`}>{l.employee.user.firstName} {l.employee.user.lastName}</Link></td>
                  <td data-label="Leave">{typeName(l.type)}<div className="small muted">{fmtDate(l.fromDate)} to {fmtDate(l.toDate)}</div></td>
                  <td data-label="Days">{days(l.fromDate, l.toDate)}</td>
                  <td data-label="Reason">{l.reason ?? "—"}</td>
                  <td data-label="" className="r">{manage && l.employee.userId !== v.user.id ? (
                    <div className="row tight" style={{ justifyContent: "flex-end" }}>
                      <ActionForm action={decideLeaveAction}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="approve" /><SubmitButton size="sm" variant="success" icon="check">Approve</SubmitButton></ActionForm>
                      <ActionForm action={decideLeaveAction} className="row tight"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="reject" /><input className="input sm" name="note" placeholder="Reason" aria-label="Reason" style={{ width: 130 }} /><SubmitButton size="sm" variant="ghost">Decline</SubmitButton></ActionForm>
                    </div>
                  ) : <span className="small muted">{manage ? "Your own" : "HR decides"}</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
        <section className="card pad-0">
          <div className="card-h"><h3>Recently decided</h3></div>
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Staff</th><th>Leave</th><th>Decision</th></tr></thead>
            <tbody>
              {!recent.length && <tr><td colSpan={3} className="empty">None yet.</td></tr>}
              {recent.map((l) => (
                <tr key={l.id}>
                  <td data-label="Staff">{l.employee.user.firstName} {l.employee.user.lastName}</td>
                  <td data-label="Leave">{typeName(l.type)} · {fmtDate(l.fromDate)} to {fmtDate(l.toDate)}</td>
                  <td data-label="Decision"><Pill tone={l.status === "APPROVED" ? "ok" : "err"}>{l.status === "APPROVED" ? "Approved" : "Declined"}</Pill> <span className="small muted">by {l.decidedBy}{l.note ? `: ${l.note}` : ""}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      </div>
    </>
  );
}
