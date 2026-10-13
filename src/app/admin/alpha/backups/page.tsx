import Link from "next/link";
import { fmtDateTime } from "@/shared/lib/format";
import { Card, CardHeader, Empty, Note, PageHeader, Pill } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { listAudit } from "@/modules/audit";
import { createBackupAction, listBackups, prepareRestoreAction, restoreAction, uploadBackupAction } from "@/modules/backup";
import { RestoreFlow } from "../../_components";

export const metadata = { title: "Backups & restores" };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;
const KIND = { MANUAL: ["Manual", "info"], SAFETY: ["Before restore", "warn"], AUTOMATIC: ["Automatic", "plain"] } as const;

export default async function AlphaBackups() {
  await requireStaff("system.alpha");
  const [backups, history] = await Promise.all([listBackups(10_000), listAudit({ entity: "Backup", take: 200 })]);
  return (
    <>
      <PageHeader title="Backups & restores" sub="Every backup on the server and everything that has been done with backups."
        actions={<ActionForm action={createBackupAction}><SubmitButton icon="db">Create backup now</SubmitButton></ActionForm>} />
      <div className="stack loose">
        <Note icon="shield">Restoring replaces all data with the backup&apos;s contents. A safety backup is taken first, everyone is signed out, and you confirm with your 2FA code.</Note>
        <Card className="stack">
          <h3>Restore</h3>
          <RestoreFlow upload={uploadBackupAction} prepare={prepareRestoreAction} restore={restoreAction} backups={backups.map((b) => ({ id: b.id, fileName: b.fileName }))} />
        </Card>
        <Card pad={false}>
          <CardHeader title={`All backups (${backups.length})`} />
          {backups.length === 0 ? <Empty title="No backups yet" /> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>File</th><th>Created</th><th>Size</th><th>Type</th><th>By</th><th>Checksum</th><th /></tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td data-label="File" className="mono small">{b.fileName}</td><td data-label="Created">{fmtDateTime(b.createdAt)}</td><td data-label="Size" className="tnum">{mb(b.size)}</td>
                    <td data-label="Type"><Pill tone={KIND[b.kind][1]}>{KIND[b.kind][0]}</Pill></td>
                    <td data-label="By">{b.createdBy}</td>
                    <td data-label="Checksum" className="mono tiny" title={b.checksum}>{b.checksum.slice(0, 12)}…</td>
                    <td data-label="" className="r"><a className="btn sm" href={`/api/admin/backups/${b.id}`}><Icon name="download" size="sm" /> Download</a></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
        <Card pad={false}>
          <CardHeader title="Backup and restore history" right={<Link className="btn sm" href="/admin/alpha/audit?entity=Backup">In the audit log</Link>} />
          {history.rows.length === 0 ? <Empty title="Nothing yet" /> : (
            <div className="tbl-wrap"><table className="t rt">
              <thead><tr><th>Time</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
              <tbody>
                {history.rows.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Time" className="small tnum">{fmtDateTime(a.createdAt)}</td>
                    <td data-label="Who">{a.actorName}</td>
                    <td data-label="What">{a.action.includes("Restored") ? <Pill tone="warn">{a.action}</Pill> : a.action}</td>
                    <td data-label="Details" className="small mono" style={{ maxWidth: 360, overflowWrap: "anywhere" }}>{a.details ? JSON.stringify(a.details).slice(0, 200) : ""}</td>
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
