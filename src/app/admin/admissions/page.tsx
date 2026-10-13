import Link from "next/link";
import { fmtDate } from "@/shared/lib/format";
import { LinkButton, PageHeader, Empty } from "@/shared/ui/primitives";
import { SearchParamInput, SearchParamSelect } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { listClasses } from "@/modules/catalogue";
import { admissionStatus, DOC_KINDS, listApplications, listWindows, STATUS_LABEL } from "@/modules/admissions";
import { STATUS_TONE } from "./_tone";

export const metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ w?: string; status?: string; cls?: string; q?: string; page?: string }> }) {
  const v = await requireStaff("admissions.view");
  const sp = await searchParams;
  const [windows, classes, current] = await Promise.all([listWindows(), listClasses(), admissionStatus()]);
  const windowId = sp.w === "all" ? undefined : (sp.w ?? current.window?.id);
  const res = await listApplications({ windowId, status: sp.status, classId: sp.cls, q: sp.q, page: Number(sp.page) || 1 });
  const required = DOC_KINDS.filter((d) => d.required).map((d) => d.kind);
  const params = (extra: Record<string, string>) => `/admin/admissions?${new URLSearchParams({ ...(sp.w ? { w: sp.w } : {}), ...(sp.cls ? { cls: sp.cls } : {}), ...(sp.q ? { q: sp.q } : {}), ...(sp.status ? { status: sp.status } : {}), ...extra })}`;
  const total = Object.values(res.counts).reduce((a, b) => a + (b ?? 0), 0);

  if (!windows.length) {
    return (
      <>
        <PageHeader title="Applications" />
        <div className="card">
          <Empty title="No admission window yet" action={v.permissions.has("admissions.publish") ? <LinkButton href="/admin/admissions/windows" variant="primary" icon="plus">Set up an admission window</LinkButton> : undefined}>
            Create an admission window with its opening and closing dates. The website&apos;s Apply online page opens automatically on the opening date.
          </Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Applications"
        sub={current.open && current.window ? `${current.window.session} admission is open` : current.upcoming && current.window ? `${current.window.session} admission opens ${fmtDate(current.window.opensAt)}` : "Admission is closed"}
        actions={v.permissions.has("admissions.publish") ? <LinkButton href="/admin/admissions/windows" icon="clock">Windows &amp; exams</LinkButton> : undefined}
      />
      <div className="stack">
        <div className="chips" role="tablist" aria-label="Filter by status">
          <Link className={`chip ${!sp.status ? "on" : ""}`} href={params({ status: "" }).replace(/status=&?/, "")}>All <span className="muted">{total}</span></Link>
          {Object.entries(STATUS_LABEL).map(([k, label]) => res.counts[k as keyof typeof res.counts] ? (
            <Link key={k} className={`chip ${sp.status === k ? "on" : ""}`} href={params({ status: k })}>{label} <span className="muted">{res.counts[k as keyof typeof res.counts]}</span></Link>
          ) : null)}
        </div>
        <section className="card"><div className="row">
          <SearchParamInput param="q" id="ap-q" placeholder="Name, application number or phone" width={260} />
          <SearchParamSelect param="w" id="ap-w" label="Session" options={[...windows.map((w) => [w.id, w.session] as [string, string]), ["all", "All sessions"]]} />
          <SearchParamSelect param="cls" id="ap-cls" label="Class" options={[["", "All classes"], ...classes.map((c) => [c.id, c.name] as [string, string])]} />
        </div></section>

        {res.rows.length === 0 ? (
          <div className="card"><Empty title="No applications match">Applications appear here as families apply on the website.</Empty></div>
        ) : (
          <div className="card pad-0">
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>Application</th><th>Child</th><th>Class</th><th>Parent</th><th>Documents</th><th>Status</th><th>Applied</th></tr></thead>
              <tbody>
                {res.rows.map((a) => {
                  const have = required.filter((k) => a.documents.some((d) => d.kind === k)).length;
                  return (
                    <tr key={a.id}>
                      <td data-label="Application"><Link className="mono" href={`/admin/admissions/${a.id}`}>{a.number}</Link></td>
                      <td data-label="Child"><b>{a.surname}</b>, {a.otherNames}</td>
                      <td data-label="Class">{a.class.name}</td>
                      <td data-label="Parent">{a.parentName}<div className="small muted">{a.parentPhone}</div></td>
                      <td data-label="Documents">{have === required.length ? <span className="pill ok">Complete</span> : <span className="pill warn">{have}/{required.length} required</span>}</td>
                      <td data-label="Status"><span className={`pill ${STATUS_TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span>{a.examSlot && a.status === "EXAM_SCHEDULED" && <div className="small muted">{fmtDate(a.examSlot.startsAt)}</div>}</td>
                      <td data-label="Applied">{fmtDate(a.submittedAt ?? a.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        )}
        {res.pages > 1 && (
          <div className="row between">
            <span className="small muted">Page {res.page} of {res.pages}</span>
            <div className="pager">
              {res.page > 1 ? <Link className="btn sm" href={params({ page: String(res.page - 1) })}><Icon name="back" size="sm" /> Previous</Link> : <span className="btn sm is-disabled"><Icon name="back" size="sm" /> Previous</span>}
              {res.page < res.pages ? <Link className="btn sm" href={params({ page: String(res.page + 1) })}>Next <Icon name="chev" size="sm" /></Link> : <span className="btn sm is-disabled">Next <Icon name="chev" size="sm" /></span>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
