import Link from "next/link";
import { fmtDateTime } from "@/shared/lib/format";
import { Card, Empty, PageHeader } from "@/shared/ui/primitives";
import { SearchParamInput } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { listAudit } from "@/modules/audit";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireStaff("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listAudit({ q: sp.q, take: 50, skip: (page - 1) * 50 });
  const pages = Math.max(1, Math.ceil(total / 50));
  const link = (n: number) => `/admin/audit?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(n) })}`;
  return (
    <>
      <PageHeader title="Audit log" sub="Append-only: nobody, including the Super Admin, can edit or delete entries." />
      <div className="stack">
        <div className="row" style={{ maxWidth: 460 }}><SearchParamInput param="q" id="au-q" placeholder="Filter by person, action or record" /></div>
        <Card pad={false}>
          {rows.length === 0 ? <Empty title="No entries" /> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>Time</th><th>Who</th><th>Role</th><th>Action</th><th>Record</th><th>Details</th><th>IP</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Time" className="tnum small">{fmtDateTime(a.createdAt)}</td><td data-label="Who"><b>{a.actorName}</b></td><td data-label="Role">{a.actorRole}</td>
                    <td data-label="Action">{a.action}</td><td data-label="Record" className="small">{a.entity}{a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""}</td>
                    <td data-label="Details" className="small mono" style={{ maxWidth: 320, overflowWrap: "anywhere" }}>{a.details ? JSON.stringify(a.details).slice(0, 160) : ""}</td>
                    <td data-label="IP" className="small tnum">{a.ip ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
        {pages > 1 && <div className="row between"><span className="small muted">Page {page} of {pages} · {total} entries</span><div className="pager">{page > 1 && <Link className="btn sm" href={link(page - 1)}>Previous</Link>}{page < pages && <Link className="btn sm" href={link(page + 1)}>Next</Link>}</div></div>}
      </div>
    </>
  );
}
