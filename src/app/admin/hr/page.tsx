import Link from "next/link";
import { db } from "@/shared/lib/db";
import { LinkButton, PageHeader, Pill } from "@/shared/ui/primitives";
import { SearchParamInput, SearchParamSelect } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { listEmployees, sectionName, STAFF_SECTIONS_LIST } from "@/modules/hr";

export const metadata = { title: "Staff" };

const BANK: Record<string, [string, "ok" | "warn" | "err" | "plain"]> = {
  NONE: ["No bank details", "plain"], PENDING: ["Bank to verify", "warn"], VERIFIED: ["Bank verified", "ok"], REJECTED: ["Bank rejected", "err"],
};

export default async function StaffListPage({ searchParams }: { searchParams: Promise<{ q?: string; section?: string; status?: string }> }) {
  const v = await requireStaff("hr.view.section");
  const sp = await searchParams;
  // Head teachers see only their own section
  const own = v.permissions.has("hr.view") ? null : (await db.employee.findUnique({ where: { userId: v.user.id }, select: { section: true } }))?.section ?? "none";
  const status = sp.status === "INACTIVE" || sp.status === "all" ? sp.status : "ACTIVE";
  const rows = await listEmployees({ q: sp.q, section: sp.section, status, onlySection: own });
  const canManage = v.permissions.has("hr.manage");
  return (
    <>
      <PageHeader title="Staff" sub={own ? `${sectionName(own)} · ${rows.length} staff` : `${rows.length} ${status === "ACTIVE" ? "active" : status === "INACTIVE" ? "former" : ""} staff`}
        actions={canManage ? <LinkButton href="/admin/hr/new" variant="primary" icon="plus">Register staff</LinkButton> : undefined} />
      <div className="stack">
        <section className="card"><div className="row">
          <SearchParamInput param="q" id="hr-q" placeholder="Name, staff code, email or position" width={240} />
          {!own && <SearchParamSelect param="section" id="hr-s" label="Section" options={[["", "All sections"], ...STAFF_SECTIONS_LIST.map((s) => [s.id, s.name] as [string, string])]} />}
          <SearchParamSelect param="status" id="hr-st" label="Status" options={[["ACTIVE", "Active"], ["INACTIVE", "Left"], ["all", "All"]]} />
        </div></section>
        <section className="card pad-0">
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Staff</th><th>Position</th><th>Section</th><th>Onboarding</th><th>Bank</th></tr></thead>
            <tbody>
              {!rows.length && <tr><td colSpan={5} className="empty">No staff here yet.{canManage ? " Use Register staff to add the first one." : ""}</td></tr>}
              {rows.map((e) => {
                const done = e.onboarding.steps.filter((s) => s.done).length;
                return (
                  <tr key={e.id}>
                    <td data-label="Staff"><Link href={`/admin/hr/${e.id}`}><b>{e.user.firstName} {e.user.lastName}</b></Link><div className="small muted mono">{e.staffCode}{e.status === "INACTIVE" ? " · left" : ""}</div></td>
                    <td data-label="Position">{e.position}{e.isTeacher ? <span className="small muted"> · teacher</span> : null}</td>
                    <td data-label="Section">{sectionName(e.section)}</td>
                    <td data-label="Onboarding">{e.onboarding.complete ? <Pill tone="ok">Complete</Pill> : <Pill tone="warn">{done} of {e.onboarding.steps.length} done</Pill>}</td>
                    <td data-label="Bank"><Pill tone={BANK[e.bankStatus][1]}>{BANK[e.bankStatus][0]}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>
      </div>
    </>
  );
}
