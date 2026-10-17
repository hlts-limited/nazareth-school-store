import Link from "next/link";
import { db } from "@/shared/lib/db";
import { PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { sectionName } from "@/modules/hr";
import { lagosDate, monthTotals } from "@/modules/attendance";

export const metadata = { title: "Attendance by month" };

const shift = (m: string, by: number) => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + by); return d.toISOString().slice(0, 7); };

/** Each person's days on time, late, absent and on leave for a month: the figures payroll uses. */
export default async function AttendanceMonthPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const v = await requireStaff("attendance.view.section");
  const sp = await searchParams;
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : lagosDate().slice(0, 7);
  const own = v.permissions.has("attendance.manage") ? null : (await db.employee.findUnique({ where: { userId: v.user.id }, select: { section: true } }))?.section ?? "none";
  const [staff, totals] = await Promise.all([
    db.employee.findMany({ where: { status: "ACTIVE", ...(own ? { section: own } : {}) }, include: { user: { select: { firstName: true, lastName: true } } }, orderBy: [{ section: "asc" }, { staffCode: "asc" }] }),
    monthTotals(m),
  ]);
  const label = new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <>
      <PageHeader title="Attendance by month" sub={label}
        actions={<div className="row tight"><Link className="btn sm" href={`?m=${shift(m, -1)}`}>Previous month</Link>{m < lagosDate().slice(0, 7) && <Link className="btn sm" href={`?m=${shift(m, 1)}`}>Next month</Link>}<a className="btn sm" href={`/api/admin/attendance/export?m=${m}`} download>Download Excel</a></div>} />
      <section className="card pad-0">
        <div className="tbl-wrap"><table className="t rt">
          <thead><tr><th>Staff</th><th>Section</th><th className="r">On time</th><th className="r">Late</th><th className="r">Absent</th><th className="r">On leave</th></tr></thead>
          <tbody>
            {staff.map((e) => {
              const t = totals.get(e.id);
              return (
                <tr key={e.id}>
                  <td data-label="Staff"><Link href={`/admin/hr/${e.id}`}>{e.user.firstName} {e.user.lastName}</Link><div className="small muted mono">{e.staffCode}</div></td>
                  <td data-label="Section">{sectionName(e.section)}</td>
                  <td data-label="On time" className="r">{t?.PRESENT ?? 0}</td>
                  <td data-label="Late" className="r">{t?.LATE ? <b>{t.LATE}</b> : 0}</td>
                  <td data-label="Absent" className="r">{t?.ABSENT ? <b>{t.ABSENT}</b> : 0}</td>
                  <td data-label="On leave" className="r">{t?.LEAVE ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
