"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, Dialog, FieldError, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

/* Backups: the three-step restore. */

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
type Manifest = { createdAt: string; createdBy: string; counts: Record<string, number>; files: number };
export function RestoreFlow({ upload, prepare, restore, backups }: { upload: Action; prepare: Action; restore: Action; backups: { id: string; fileName: string }[] }) {
  const [staged, setStaged] = useState<{ token: string; manifest: Manifest; fileName: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const onStaged = (r: ActionResult) => { if (r.ok && r.data) { setStaged(r.data as never); setUploadOpen(false); setConfirm(""); } };
  return (
    <>
      <div className="row">
        <button type="button" className="btn" onClick={() => setUploadOpen(true)}><Icon name="upload" size="sm" /> Upload backup</button>
        {backups.length > 0 && (
          <ActionForm action={prepare} className="row tight" onDone={onStaged}>
            <select className="input sm" name="backupId" aria-label="Backup to restore" style={{ width: "auto", maxWidth: 260 }}>
              {backups.map((b) => <option key={b.id} value={b.id}>{b.fileName}</option>)}
            </select>
            <SubmitButton size="sm" variant="default" icon="restore">Restore…</SubmitButton>
          </ActionForm>
        )}
      </div>
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload backup">
        <ActionForm action={upload} className="stack" onDone={onStaged}>
          <div className="field"><label htmlFor="bk-f">Backup file (.nzbak)</label><input className="input" id="bk-f" name="file" type="file" accept=".nzbak,application/octet-stream" /><FieldError name="file" /></div>
          <div className="field"><label htmlFor="bk-p">Backup password</label><input className="input" id="bk-p" name="password" type="password" autoComplete="off" /><span className="hint">The BACKUP_PASSWORD of the server that made the backup.</span><FieldError name="password" /></div>
          <p className="small muted">The file is checked first. Nothing changes until you confirm on the next step.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={() => setUploadOpen(false)}>Cancel</button><SubmitButton>Check backup</SubmitButton></div>
        </ActionForm>
      </Dialog>
      <Dialog open={!!staged} onClose={() => setStaged(null)} title="Restore backup">
        {staged && (
          <ActionForm action={restore} className="stack">
            <input type="hidden" name="token" value={staged.token} />
            <div className="note ok"><Icon name="check" /><span><b>{staged.fileName || "Backup"}</b> is valid. Made {new Date(staged.manifest.createdAt).toLocaleString("en-GB")} by {staged.manifest.createdBy}.</span></div>
            <div className="grid g3">
              <div className="card kpi"><span className="l">Pupils</span><span className="v">{staged.manifest.counts.Pupil ?? 0}</span></div>
              <div className="card kpi"><span className="l">Orders</span><span className="v">{staged.manifest.counts.Order ?? 0}</span></div>
              <div className="card kpi"><span className="l">Files</span><span className="v">{staged.manifest.files}</span></div>
            </div>
            <div className="note err"><Icon name="alert" /><span>This replaces <b>all current data</b>. A safety backup of today&apos;s data is taken first. Everyone, including you, will be signed out.</span></div>
            <div className="field"><label htmlFor="rs-c">Your 2FA code</label><input className="input mono" id="rs-c" name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" /><FieldError name="code" /></div>
            <div className="field"><label htmlFor="rs-t">Type RESTORE to confirm</label><input className="input mono" id="rs-t" name="confirm" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} /><FieldError name="confirm" /></div>
            <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={() => setStaged(null)}>Cancel</button><SubmitButton variant="danger" disabled={confirm !== "RESTORE"}>Restore now</SubmitButton></div>
          </ActionForm>
        )}
      </Dialog>
    </>
  );
}
