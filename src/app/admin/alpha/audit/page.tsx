import Link from "next/link";
import { fmtDateTime } from "@/shared/lib/format";
import { Card, Empty, PageHeader } from "@/shared/ui/primitives";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { listAudit } from "@/modules/audit";
import { auditFilterFrom, type AuditParams } from "./_filter";

export const metadata = { title: "Full audit log" };

const PER = 100;

export default async function AlphaAudit({ searchParams }: { searchParams: Promise<AuditParams & { page?: string }> }) {
  await requireStaff("system.alpha");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listAudit({ ...auditFilterFrom(sp), take: PER, skip: (page - 1) * PER });
  const pages = Math.max(1, Math.ceil(total / PER));
  const params = Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "page" && v)) as Record<string, string>;
  const link = (n: number) => `/admin/alpha/audit?${new URLSearchParams({ ...params, page: String(n) })}`;
  return (
    <>
      <PageHeader title="Full audit log" sub="Everything everyone has done, newest first. Entries can never be edited or deleted."
        actions={<a className="btn" href={`/admin/alpha/audit/export?${new URLSearchParams(params)}`}><Icon name="download" size="sm" /> Export CSV</a>} />
      <div className="stack">
        <Card>
          <form className="grid g4" method="get">
            <label className="stack tight small">Person<input className="input" name="who" defaultValue={sp.who} placeholder="Name" /></label>
            <label className="stack tight small">Action<input className="input" name="action" defaultValue={sp.action} placeholder="e.g. Signed in, Alpha:" /></label>
            <label className="stack tight small">Record type<input className="input" name="entity" defaultValue={sp.entity} placeholder="e.g. Order, User, Backup" /></label>
            <label className="stack tight small">Anything<input className="input" name="q" defaultValue={sp.q} placeholder="Search all" /></label>
            <label className="stack tight small">From<input className="input" type="date" name="from" defaultValue={sp.from} /></label>
            <label className="stack tight small">To (inclusive)<input className="input" type="date" name="to" defaultValue={sp.to} /></label>
            <div className="row" style={{ alignSelf: "end" }}><button className="btn primary" type="submit"><Icon name="search" size="sm" /> Filter</button><Link className="btn" href="/admin/alpha/audit">Clear</Link></div>
          </form>
        </Card>
        <p className="small muted">{total.toLocaleString()} entr{total === 1 ? "y" : "ies"}</p>
        <Card pad={false}>
          {rows.length === 0 ? <Empty title="No entries" /> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>Time</th><th>Who</th><th>Role</th><th>Action</th><th>Record</th><th>Details</th><th>IP</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Time" className="tnum small">{fmtDateTime(a.createdAt)}</td><td data-label="Who"><b>{a.actorName}</b></td><td data-label="Role" className="small">{a.actorRole}</td>
                    <td data-label="Action">{a.action}</td><td data-label="Record" className="small">{a.entity}{a.entityId ? ` · ${a.entityId.slice(0, 24)}` : ""}</td>
                    <td data-label="Details" className="small mono" style={{ maxWidth: 380, overflowWrap: "anywhere" }}>{a.details ? JSON.stringify(a.details) : ""}</td>
                    <td data-label="IP" className="small tnum">{a.ip ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
        {pages > 1 && <div className="row between"><span className="small muted">Page {page} of {pages}</span><div className="pager">{page > 1 && <Link className="btn sm" href={link(page - 1)}>Previous</Link>}{page < pages && <Link className="btn sm" href={link(page + 1)}>Next</Link>}</div></div>}
      </div>
    </>
  );
}
