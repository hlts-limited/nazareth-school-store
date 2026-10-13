import Link from "next/link";
import { fmtDateTime } from "@/shared/lib/format";
import { Card, CardHeader, Kpi, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { systemOverview } from "@/modules/alpha";

export const metadata = { title: "System overview" };

export default async function AlphaOverview() {
  await requireStaff("system.alpha");
  const o = await systemOverview();
  const rows = o.counts.reduce((n, t) => n + t.count, 0);
  return (
    <>
      <PageHeader title="System overview" sub="Alpha Admin: everything in the system. Every change you make here is recorded in the audit log." />
      <div className="stack loose">
        <div className="grid g4">
          <Kpi label="Database size" value={o.size} sub={`${o.counts.length} tables · ${rows.toLocaleString()} rows`} />
          <Kpi label="Signed-in sessions" value={o.sessions} sub={<Link href="/admin/sessions">Manage sessions</Link>} />
          <Kpi label="Last backup" value={<span style={{ fontSize: 18 }}>{o.lastBackup ? fmtDateTime(o.lastBackup.createdAt) : "None yet"}</span>} sub={<Link href="/admin/alpha/backups">{o.backups} kept · Backups &amp; restores</Link>} tone={o.lastBackup ? undefined : "warn"} />
          <Kpi label="Audit log" value={o.auditCount.toLocaleString()} sub={<Link href="/admin/alpha/audit">Open the full log</Link>} />
        </div>
        <Note icon="shield">The audit log stays append-only and the SQL console is read-only, even for the Alpha Admin. Change data through the Data explorer, where each change is logged with its old and new values.</Note>
        <div className="grid g2" style={{ alignItems: "start" }}>
          <Card pad={false}>
            <CardHeader title="Tables" right={<Link className="btn sm" href="/admin/alpha/data">Data explorer</Link>} />
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>Table</th><th className="r">Rows</th></tr></thead>
              <tbody>
                {o.counts.map((t) => (
                  <tr key={t.name}>
                    <td data-label="Table"><Link href={`/admin/alpha/data/${t.name}`}>{t.name}</Link>{t.readOnly && <span className="tiny muted"> · read-only</span>}</td>
                    <td data-label="Rows" className="r tnum">{t.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
          <div className="stack">
            <Card className="stack">
              <h3>Connected services</h3>
              {Object.entries(o.services).map(([name, on]) => (
                <div key={name} className="row between"><span className="small">{name}</span><Pill tone={on ? "ok" : "warn"}>{on ? "Set up" : "Not set"}</Pill></div>
              ))}
              <p className="tiny muted">Site address: {o.appUrl}</p>
            </Card>
            <Card pad={false}>
              <CardHeader title="Database migrations" />
              <div className="tbl-wrap"><table className="t rt">
                <thead><tr><th>Migration</th><th>Applied</th></tr></thead>
                <tbody>
                  {o.migrations.map((m) => (
                    <tr key={m.migration_name}>
                      <td data-label="Migration" className="mono small">{m.migration_name}</td>
                      <td data-label="Applied" className="small">{m.rolled_back_at ? <Pill tone="err">Rolled back</Pill> : m.finished_at ? fmtDateTime(m.finished_at) : <Pill tone="warn">Not finished</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
