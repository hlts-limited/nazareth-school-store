import Link from "next/link";
import { DataTable } from "@/shared/ui/data-table";
import { keyed } from "@/shared/ui/table-cells";
import { branchName } from "@/shared/config/school";
import { LinkButton, PageHeader, Pill } from "@/shared/ui/primitives";
import { SearchParamInput, SearchParamSelect } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { listEmployees, sectionName, STAFF_SECTIONS_LIST, sectionScope } from "@/modules/hr";

export const metadata = { title: "Staff" };

const BANK: Record<string, [string, "ok" | "warn" | "err" | "plain"]> = {
  NONE: ["No bank details", "plain"], PENDING: ["Bank to verify", "warn"], VERIFIED: ["Bank verified", "ok"], REJECTED: ["Bank rejected", "err"],
};

export default async function StaffListPage({ searchParams }: { searchParams: Promise<{ q?: string; section?: string; status?: string }> }) {
  const v = await requireStaff("hr.view.section");
  const sp = await searchParams;
  // Head teachers see only their own section
  const own = await sectionScope(v, "hr.view");
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
          <DataTable
            empty="No staff here yet" emptyText={canManage ? "Use Register staff to add the first one." : undefined}
            columns={[{ label: "Staff", sortable: true }, { label: "Position", sortable: true }, { label: "Section · branch", sortable: true }, { label: "Onboarding", sortable: true }, { label: "Bank", sortable: true }]}
            rows={rows.map((e) => {
              const done = e.onboarding.steps.filter((st) => st.done).length;
              return {
                id: e.id,
                sort: [`${e.user.lastName} ${e.user.firstName}`, e.position, `${sectionName(e.section)} ${e.branch ?? ""}`, e.onboarding.complete ? 99 : done, BANK[e.bankStatus][0]],
                cells: keyed([
                  <><Link href={`/admin/hr/${e.id}`}><b>{e.user.firstName} {e.user.lastName}</b></Link><div className="small muted mono">{e.staffCode}{e.status === "INACTIVE" ? " · left" : ""}</div></>,
                  <>{e.position}{e.isTeacher ? <span className="small muted"> · teacher</span> : null}</>,
                  <>{sectionName(e.section)}{e.branch !== e.section && <div className="small muted">{e.branch ? branchName(e.branch) : <Pill tone="warn">Branch not set</Pill>}</div>}</>,
                  e.onboarding.complete ? <Pill tone="ok">Complete</Pill> : <Pill tone="warn">{done} of {e.onboarding.steps.length} done</Pill>,
                  <Pill key="bank" tone={BANK[e.bankStatus][1]}>{BANK[e.bankStatus][0]}</Pill>,
                ]),
              };
            })}
          />
        </section>
      </div>
    </>
  );
}
