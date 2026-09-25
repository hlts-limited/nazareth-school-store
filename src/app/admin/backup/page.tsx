import { fmtDateTime } from "@/shared/lib/format";
import { Card, CardHeader, Empty, Kpi, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { createBackupAction, listBackups, prepareRestoreAction, restoreAction, uploadBackupAction } from "@/modules/backup";
import { RestoreFlow } from "../_components";

export const metadata = { title: "Backup & restore" };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;

export default async function BackupPage() {
  await requireStaff("backup.manage");
  const backups = await listBackups();
  const last = backups[0];
  return (
    <>
      <PageHeader title="Backup & restore" sub="A backup holds the database, uploaded receipts and product photos, and school settings. Passwords for outside services are never included."
        actions={<ActionForm action={createBackupAction}><SubmitButton icon="db">Create backup now</SubmitButton></ActionForm>} />
      <div className="stack loose">
        <div className="grid g3">
          <Kpi label="Last backup" value={<span style={{ fontSize: 18 }}>{last ? fmtDateTime(last.createdAt) : "None yet"}</span>} sub={last?.createdBy} />
          <Kpi label="Automatic backups" value={<span style={{ fontSize: 18 }}>Nightly, 2am</span>} sub="Via the daily scheduled job" />
          <Kpi label="Kept" value={<span style={{ fontSize: 18 }}>30 daily · 12 monthly</span>} sub="Plus every manual backup" />
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
              <thead><tr><th>File</th><th>Created</th><th>Size</th><th>Type</th><th>By</th><th /></tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td data-label="File" className="mono small">{b.fileName}</td><td data-label="Created">{fmtDateTime(b.createdAt)}</td><td data-label="Size" className="tnum">{mb(b.size)}</td>
                    <td data-label="Type"><Pill tone={b.kind === "MANUAL" ? "info" : b.kind === "SAFETY" ? "warn" : "plain"}>{b.kind === "MANUAL" ? "Manual" : b.kind === "SAFETY" ? "Before restore" : "Automatic"}</Pill></td>
                    <td data-label="By">{b.createdBy}</td>
                    <td data-label="" className="r"><a className="btn sm" href={`/api/admin/backups/${b.id}`}><Icon name="download" size="sm" /> Download</a></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      </div>
    </>
  );
}
