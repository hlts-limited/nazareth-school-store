import Link from "next/link";
import { fmtDateTime } from "@/shared/lib/format";
import { Card, CardHeader, Empty, Kpi, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { listAudit } from "@/modules/audit";
import { createBackupAction, listBackups, prepareRestoreAction, restoreAction, uploadBackupAction } from "@/modules/backup";
import { RestoreFlow } from "./_widgets";

export const metadata = { title: "Backups & restores" };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;

export default async function BackupPage() {
  const v = await requireStaff("backup.manage");
  // The Alpha Admin also sees every backup ever kept, checksums and the backup history
  const [backups, history] = await Promise.all([listBackups(v.isAlpha ? 10_000 : undefined), v.isAlpha ? listAudit({ entity: "Backup", take: 200 }) : null]);
  const last = backups[0];
  return (
    <>
      <PageHeader title="Backups & restores" sub="A backup holds the database, uploaded receipts and product photos, and school settings. Passwords for outside services are never included."
        actions={<ActionForm action={createBackupAction}><SubmitButton icon="db">Create backup now</SubmitButton></ActionForm>} />
      <div className="stack loose">
        <div className="grid g3">
          <Kpi label="Last backup" value={<span className="fs-18">{last ? fmtDateTime(last.createdAt) : "None yet"}</span>} sub={last?.createdBy} />
          <Kpi label="Automatic backups" value={<span className="fs-18">Nightly, 2am</span>} sub="Via the daily scheduled job" />
          <Kpi label="Kept" value={<span className="fs-18">30 daily · 12 monthly</span>} sub="Plus every manual backup" />
        </div>
        <Note icon="shield">Backups are encrypted with the server&apos;s BACKUP_PASSWORD. Download a copy regularly and keep it somewhere other than the server, together with that password.</Note>
        <Card className="stack">
          <h3>Restore</h3>
          <p className="small muted">Restore from a backup on this server, or upload a backup file. You&apos;ll see what&apos;s inside and confirm with your 2FA code before anything changes.</p>
          <RestoreFlow upload={uploadBackupAction} prepare={prepareRestoreAction} restore={restoreAction} backups={backups.map((b) => ({ id: b.id, fileName: b.fileName }))} />
        </Card>
        <Card pad={false}>
          <CardHeader title="Backups" />
          {backups.length === 0 ? <Empty title="No backups yet">Create one now, and make sure the daily job is scheduled (see the README).</Empty> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>File</th><th>Created</th><th>Size</th><th>Type</th><th>By</th>{v.isAlpha && <th>Checksum</th>}<th /></tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td data-label="File" className="mono small">{b.fileName}</td><td data-label="Created">{fmtDateTime(b.createdAt)}</td><td data-label="Size" className="tnum">{mb(b.size)}</td>
                    <td data-label="Type"><Pill tone={b.kind === "MANUAL" ? "info" : b.kind === "SAFETY" ? "warn" : "plain"}>{b.kind === "MANUAL" ? "Manual" : b.kind === "SAFETY" ? "Before restore" : "Automatic"}</Pill></td>
                    <td data-label="By">{b.createdBy}</td>
                    {v.isAlpha && <td data-label="Checksum" className="mono tiny" title={b.checksum}>{b.checksum.slice(0, 12)}…</td>}
                    <td data-label="" className="r"><a className="btn sm" href={`/api/admin/backups/${b.id}`}><Icon name="download" size="sm" /> Download</a></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
        {history && (
          <Card pad={false}>
            <CardHeader title="Backup and restore history" right={<Link className="btn sm" href="/admin/audit?entity=Backup">In the audit log</Link>} />
            {history.rows.length === 0 ? <Empty title="Nothing yet" /> : (
              <div className="tbl-wrap"><table className="t rt">
                <thead><tr><th>Time</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
                <tbody>
                  {history.rows.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Time" className="small tnum">{fmtDateTime(a.createdAt)}</td>
                      <td data-label="Who">{a.actorName}</td>
                      <td data-label="What">{a.action.includes("Restored") ? <Pill tone="warn">{a.action}</Pill> : a.action}</td>
                      <td data-label="Details" className="small mono details-cell">{a.details ? JSON.stringify(a.details).slice(0, 200) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
