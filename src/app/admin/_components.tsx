"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, Dialog, FieldError, SubmitButton, useToast } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
const n = (v: number) => `${v < 0 ? "−" : ""}₦${Math.abs(Math.round(v)).toLocaleString("en-NG")}`;

// ---------------- Accountant ----------------
export function ReceiptViewer({ src, mime }: { src: string; mime: string }) {
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  if (mime === "application/pdf") {
    return <div className="receipt-view"><object data={src} type="application/pdf" aria-label="Receipt PDF"><a className="btn" href={src} target="_blank" rel="noreferrer">Open PDF receipt</a></object></div>;
  }
  return (
    <div className="receipt-view">
      <div className="receipt-tools">
        <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in"><Icon name="zoomin" size="sm" /></button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out"><Icon name="zoomout" size="sm" /></button>
        <button type="button" onClick={() => setRot((r) => (r + 90) % 360)} aria-label="Rotate"><Icon name="rotate" size="sm" /></button>
        <a href={src} target="_blank" rel="noreferrer" aria-label="Open full size" style={{ display: "grid", placeItems: "center", width: 34, height: 34, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }}><Icon name="eye" size="sm" /></a>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Uploaded transfer receipt" style={{ width: `${Math.round(280 * zoom)}px`, transform: `rotate(${rot}deg)` }} />
    </div>
  );
}

export function ApproveForm({ approve, reject, paymentId, due, claimed, firstChild, multiChild, parentFirst }: {
  approve: Action; reject: Action; paymentId: string; due: number; claimed: number; firstChild: string; multiChild: boolean; parentFirst: string;
}) {
  const [received, setReceived] = useState(String(claimed));
  const [rejectOpen, setRejectOpen] = useState(false);
  const r = parseInt(received.replace(/\D/g, ""), 10) || 0;
  const diff = r - due;
  return (
    <>
      <div className="cmp">
        <div><div className="small muted">Amount due</div><div className="v">{n(due)}</div></div>
        <div><div className="small muted">Parent says</div><div className="v">{n(claimed)}</div></div>
        <div style={diff > 0 ? { background: "var(--ok-soft)" } : diff < 0 ? { background: "var(--warn-soft)" } : undefined}>
          <div className="small muted">Difference</div><div className="v" style={{ color: diff > 0 ? "var(--ok)" : diff < 0 ? "var(--warn)" : "inherit" }}>{diff > 0 ? "+" : ""}{n(diff)}</div>
        </div>
      </div>
      <ActionForm action={approve} className="stack">
        <input type="hidden" name="paymentId" value={paymentId} />
        <div className="field"><label htmlFor="recv">Amount actually received (check the bank statement)</label>
          <input className="input tnum" id="recv" name="received" inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value)} /><FieldError name="received" /></div>
        {diff > 0 ? <div className="note ok"><Icon name="wallet" /><span>Approving will credit <b>{n(diff)}</b> to {firstChild}&apos;s wallet{multiChild ? " (the parent can move it to another child)" : ""}.</span></div>
          : diff < 0 ? <div className="note warn"><Icon name="alert" /><span>Short by <b>{n(-diff)}</b>. Confirming marks the order <b>Part paid</b> and tells {parentFirst} the balance by SMS, WhatsApp and email.</span></div>
          : <div className="note ok"><Icon name="check" /><span>Amounts match.</span></div>}
        <div className="row">
          <SubmitButton variant="success" icon="check">{diff < 0 ? "Confirm part payment" : "Approve payment"}</SubmitButton>
          <button type="button" className="btn danger" onClick={() => setRejectOpen(true)}>Reject</button>
        </div>
      </ActionForm>
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject this payment">
        <ActionForm action={reject} className="stack" onDone={(x) => x.ok && setRejectOpen(false)}>
          <input type="hidden" name="paymentId" value={paymentId} />
          <div className="field"><label htmlFor="rj-r">Reason (the parent sees this)</label>
            <select className="input" id="rj-r" name="reason">
              <option>No matching credit on our bank statement</option>
              <option>Receipt is unreadable — please upload a clearer photo</option>
              <option>Receipt was already used for another order</option>
              <option>Transfer went to the wrong account</option>
            </select></div>
          <div className="field"><label htmlFor="rj-n">Note (optional)</label><input className="input" id="rj-n" name="note" /></div>
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={() => setRejectOpen(false)}>Cancel</button><SubmitButton variant="danger">Reject and notify parent</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

export function WalletAdjust({ action, pupilId, name, balance }: { action: Action; pupilId: string; name: string; balance: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>Adjust / refund</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Wallet: ${name}`}>
        <ActionForm action={action} className="stack" onDone={(r) => r.ok && setOpen(false)}>
          <div className="kpi"><span className="l">Current balance</span><span className="v">{n(balance)}</span></div>
          <input type="hidden" name="pupilId" value={pupilId} />
          <div className="grid g2">
            <div className="field"><label htmlFor="aj-k">Type</label><select className="input" id="aj-k" name="kind"><option value="credit">Adjustment (credit)</option><option value="debit">Adjustment (debit)</option><option value="refund">Cash / transfer refund to parent</option></select></div>
            <div className="field"><label htmlFor="aj-a">Amount (₦)</label><input className="input tnum" id="aj-a" name="amount" inputMode="numeric" /><FieldError name="amount" /></div>
          </div>
          <div className="field"><label htmlFor="aj-r">Reason (required, logged)</label><input className="input" id="aj-r" name="reason" placeholder="e.g. Refund for wrong shoe size on NZ-24801" /><FieldError name="reason" /></div>
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><SubmitButton>Save and log</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

// ---------------- Registrar ----------------
export function StockDialog({ action, item, variants, label = "Stock" }: { action: Action; item: string; variants: { id: string; label: string; onHand: number; reserved: number }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [vid, setVid] = useState(variants[0]?.id ?? "");
  const v = variants.find((x) => x.id === vid) ?? variants[0];
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>{label}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Stock: ${item}`}>
        <ActionForm action={action} className="stack" onDone={(r) => r.ok && setOpen(false)}>
          {variants.length > 1 ? (
            <div className="field"><label htmlFor="sv">Size</label><select className="input" id="sv" name="variantId" value={vid} onChange={(e) => setVid(e.target.value)}>{variants.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
          ) : <input type="hidden" name="variantId" value={vid} />}
          {v && <div className="cmp"><div><div className="small muted">On hand</div><div className="v">{v.onHand}</div></div><div><div className="small muted">Reserved</div><div className="v">{v.reserved}</div></div><div><div className="small muted">Available</div><div className="v">{Math.max(0, v.onHand - v.reserved)}</div></div></div>}
          <div className="grid g2">
            <div className="field"><label htmlFor="st-t">Movement</label><select className="input" id="st-t" name="type"><option value="restock">Restock (delivery received)</option><option value="damaged">Adjustment: damaged / lost</option><option value="found">Adjustment: found in stock-take</option><option value="return">Return from parent</option></select></div>
            <div className="field"><label htmlFor="st-q">Quantity</label><input className="input tnum" id="st-q" name="qty" inputMode="numeric" defaultValue={10} /><FieldError name="qty" /></div>
          </div>
          <div className="field"><label htmlFor="st-r">Reason / supplier reference</label><input className="input" id="st-r" name="reason" placeholder="e.g. Delivery note DN-2231" /></div>
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><SubmitButton>Save movement</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

export function PackCheckbox({ action, lineId, checked, disabled, label }: { action: Action; lineId: string; checked: boolean; disabled: boolean; label: string }) {
  return (
    <ActionForm action={action} className="inline-form">
      <input type="hidden" name="lineId" value={lineId} />
      <label className="check small">
        <input type="checkbox" name="packed" defaultChecked={checked} disabled={disabled} onChange={(e) => e.currentTarget.form?.requestSubmit()} /> {label}
      </label>
    </ActionForm>
  );
}

export function PickupCodeInput({ initial }: { initial: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initial);
  return (
    <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); router.push(`/admin/store/pickup?code=${code}`); }}>
      <input className="input mono" id="pk" inputMode="numeric" maxLength={4} autoFocus value={code} placeholder="0000" aria-label="Pick-up code"
        style={{ fontSize: 22, letterSpacing: ".3em", maxWidth: 170 }}
        onChange={(e) => { const c = e.target.value.replace(/\D/g, "").slice(0, 4); setCode(c); if (c.length === 4) router.push(`/admin/store/pickup?code=${c}`); }} />
      <button className="btn primary" type="submit">Find order</button>
    </form>
  );
}

// ---------------- Secretary ----------------
type PupilRow = { id: string; name: string; sortName: string; reg: string; className: string; parent: string; parentId: string | null; parentInvited: boolean; whatsApp: string | null; phone: string; status: string };

export function PupilTable({ rows, classes, total, query, deleteAction, moveAction, inviteAction, selectAll, canDelete }: {
  rows: PupilRow[]; classes: { id: string; name: string }[]; total: number; query: { q: string; classId: string; status: string };
  deleteAction: Action; moveAction: Action; inviteAction: Action; selectAll: (q: string, classId: string, status: string) => Promise<string[]>; canDelete: boolean;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const toast = useToast();
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string, on: boolean) => setSel((s) => { const x = new Set(s); if (on) x.add(id); else x.delete(id); return x; });
  const pageToggle = (on: boolean) => setSel((s) => { const x = new Set(s); rows.forEach((r) => (on ? x.add(r.id) : x.delete(r.id))); return x; });
  const ids = [...sel];
  const hl = (text: string) => {
    const q = query.q.trim();
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark style={{ background: "var(--warn-soft)", color: "inherit", borderRadius: 3 }}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
  };
  const selectedRows = useMemo(() => rows.filter((r) => sel.has(r.id)), [rows, sel]);

  return (
    <>
      <div className="row between small">
        <span className="row tight">
          <label className="check show-md" style={{ marginRight: 6 }}><input type="checkbox" checked={allOnPage} onChange={(e) => pageToggle(e.target.checked)} aria-label="Select all on this page" /> Select page</label>
          <b className="tnum">{total}</b> <span className="muted">pupils found{query.q ? ` for “${query.q}”` : ""}</span>
        </span>
        {allOnPage && total > rows.length && sel.size < total && (
          <button type="button" className="btn ghost sm" onClick={async () => { const all = await selectAll(query.q, query.classId, query.status); setSel(new Set(all)); toast(`${all.length} pupils selected`); }}>Select all {total} matching</button>
        )}
      </div>
      <section className="card pad-0">
        <div className="tbl-wrap">
          <table className="t rt">
            <thead><tr>
              <th style={{ width: 44 }}><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={(e) => pageToggle(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--red)" }} /></th>
              <th>Pupil</th><th>Reg no.</th><th>Class</th><th>Parent / guardian</th><th>Phone</th><th>Status</th><th />
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={sel.has(p.id) ? "sel" : ""}>
                  <td className="cb" data-label=""><label className="check"><input type="checkbox" checked={sel.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} aria-label={`Select ${p.name}`} /><span className="show-md" style={{ fontWeight: 600 }}>{p.name}</span></label></td>
                  <td data-label="Pupil"><b>{hl(p.sortName)}</b></td>
                  <td data-label="Reg no." className="mono">{hl(p.reg)}</td>
                  <td data-label="Class">{p.className}</td>
                  <td data-label="Parent">{p.parent}</td>
                  <td data-label="Phone" className="tnum">{p.phone}</td>
                  <td data-label="Status">{p.status === "ACTIVE" ? <span className="pill ok">Active</span> : <span className="pill plain">Archived</span>}</td>
                  <td data-label="" className="r">{p.parentId && (
                    <div className="row tight" style={{ justifyContent: "flex-end" }}>
                      {p.whatsApp && <a className="btn sm wa" href={p.whatsApp} target="_blank" rel="noopener noreferrer" title={`Opens WhatsApp with ${p.parent}'s invite typed out. Press Send.`}><Icon name="chat" size="sm" /> WhatsApp invite</a>}
                      <ActionForm action={inviteAction} className="inline-form"><input type="hidden" name="parentId" value={p.parentId} /><SubmitButton size="sm" variant="ghost">{p.parentInvited ? "New invite link" : "Send login link"}</SubmitButton></ActionForm>
                    </div>
                  )}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8}><div className="empty"><h3>No pupils found</h3><p>Check the spelling, or search by reg number.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size} selected</b>
          <button type="button" className="btn sm ghost" style={{ color: "inherit" }} onClick={() => setSel(new Set())}>Clear</button>
          <div className="grow" />
          <ActionForm action={moveAction} className="row tight" onDone={(r) => r.ok && setSel(new Set())}>
            {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
            <select name="classId" aria-label="Move to class" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Move to class…</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <SubmitButton size="sm" variant="default" disabled={!moveTo}>Move</SubmitButton>
          </ActionForm>
          {canDelete && <button type="button" className="btn sm primary" onClick={() => { setConfirmText(""); setConfirmOpen(true); }}><Icon name="trash" size="sm" /> Delete selected</button>}
        </div>
      )}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title={`Delete ${sel.size} pupil${sel.size === 1 ? "" : "s"}?`}>
        <ActionForm action={deleteAction} className="stack" onDone={(r) => { if (r.ok) { setConfirmOpen(false); setSel(new Set()); } }}>
          {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
          {selectedRows.length > 0 && (
            <div className="stack tight" style={{ maxHeight: 200, overflow: "auto", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
              {selectedRows.map((p) => <div key={p.id} className="row between small"><span><b>{p.name}</b> <span className="muted">{p.className}</span></span><span className="mono muted">{p.reg}</span></div>)}
              {sel.size > selectedRows.length && <div className="small muted">…and {sel.size - selectedRows.length} more on other pages</div>}
            </div>
          )}
          <div className="note warn"><Icon name="info" /><span>Pupils with orders, payments or a wallet balance are <b>archived</b> instead of deleted, so financial records stay complete. Deleted pupils can be restored from “Recently deleted” for 30 days.</span></div>
          {sel.size > 5 && <div className="field"><label htmlFor="del-conf">Type DELETE to confirm</label><input className="input mono" id="del-conf" name="confirm" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /><FieldError name="confirm" /></div>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setConfirmOpen(false)}>Cancel</button>
            <SubmitButton icon="trash" disabled={sel.size > 5 && confirmText !== "DELETE"}>Delete {sel.size}</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}

type ImportRowView = { line: number; lastName: string; firstName: string; regNumber: string; className: string; error?: string };
export function ImportTool({ preview, commit, sample, header, classes }: { preview: Action; commit: Action; sample: string; header: string; classes: string[] }) {
  const [text, setText] = useState("");
  // Template: header row only, so nothing fake gets imported by accident. BOM makes Excel read it as UTF-8.
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + header + "\r\n"], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "pupil-import-template.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };
  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) { toast("Choose a .csv file. In Excel: File → Save As → CSV (Comma delimited).", false); return; }
    setText((await file.text()).replace(/^﻿/, ""));
  };
  const [state, formAction] = useActionState(preview, { ok: false });
  const rows = (state.data?.rows as ImportRowView[] | undefined) ?? null;
  const toast = useToast();
  useEffect(() => { if (!state.ok && state.message) toast(state.message, false); }, [state, toast]);
  const good = rows?.filter((r) => !r.error).length ?? 0;
  return (
    <div className="grid g2" style={{ alignItems: "start" }}>
      <form action={formAction} className="card stack">
        <div className="row">
          <button type="button" className="btn" onClick={downloadTemplate}><Icon name="download" size="sm" /> Download CSV template</button>
          <label className="btn"><Icon name="upload" size="sm" /> Upload CSV<input type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
        </div>
        <div className="field"><label htmlFor="imp">Rows (surname, first name, reg number, class, parent phone, parent name)</label>
          <textarea className="input" id="imp" name="text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Upload the filled template, or paste from Excel here" />
          <span className="hint">Class must be one of: {classes.join(", ")}.</span></div>
        <div className="row"><SubmitButton>Check rows</SubmitButton><button type="button" className="btn ghost" onClick={() => setText(sample)}>Use sample rows</button></div>
      </form>
      <section className="card stack">
        {!rows ? <div className="empty"><h3>Nothing checked yet</h3><p>Rows with problems are shown here before anything is saved.</p></div> : (
          <>
            <div className="row between"><h3>Preview</h3><span className="small"><span className="pill ok">{good} ready</span> <span className="pill err">{rows.length - good} with errors</span></span></div>
            <div className="tbl-wrap"><table className="t"><thead><tr><th>Line</th><th>Surname</th><th>First</th><th>Reg no.</th><th>Class</th><th>Result</th></tr></thead><tbody>
              {rows.map((r) => <tr key={r.line}><td className="tnum">{r.line}</td><td>{r.lastName}</td><td>{r.firstName}</td><td className="mono">{r.regNumber}</td><td>{r.className}</td><td>{r.error ? <span className="field-error">{r.error}</span> : <span className="pill ok">OK</span>}</td></tr>)}
            </tbody></table></div>
            <ActionForm action={commit}>
              <input type="hidden" name="text" value={text} />
              <SubmitButton disabled={!good}>Import {good} valid row{good === 1 ? "" : "s"}</SubmitButton>
            </ActionForm>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------- Super Admin ----------------
export function ViewAsButton({ action, target, name }: { action: Action; target: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}><Icon name="eye" size="sm" /> View as</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`View as ${name}`}>
        <ActionForm action={action} className="stack">
          <div className="note"><Icon name="shield" /><span>You&apos;ll see exactly what they see, without their password. The view is read-only, ends after 30 minutes, and is logged.</span></div>
          <input type="hidden" name="target" value={target} />
          <div className="field"><label htmlFor="va-r">Reason (logged)</label><select className="input" id="va-r" name="reason"><option>Parent called about an order</option><option>Checking a reported problem</option><option>Helping a parent over the phone</option></select></div>
          <div className="field"><label htmlFor="va-c">Your 2FA code</label><input className="input mono" id="va-c" name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" /><FieldError name="code" /></div>
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><SubmitButton icon="eye">Start viewing</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

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

export function InviteStaff({ action, roles }: { action: Action; roles: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}><Icon name="plus" size="sm" /> Invite staff</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Invite a staff member">
        <ActionForm action={action} className="stack" onDone={(r) => r.ok && setOpen(false)}>
          <div className="grid g2">
            <div className="field"><label htmlFor="is-f">First name</label><input className="input" id="is-f" name="firstName" /><FieldError name="firstName" /></div>
            <div className="field"><label htmlFor="is-l">Surname</label><input className="input" id="is-l" name="lastName" /><FieldError name="lastName" /></div>
          </div>
          <div className="field"><label htmlFor="is-e">Work email</label><input className="input" id="is-e" name="email" type="email" /><FieldError name="email" /></div>
          <div className="field"><span className="lbl">Roles</span><div className="row tight">{roles.map((r) => <label key={r.id} className="chip"><input type="checkbox" name="roles" value={r.id} style={{ accentColor: "var(--red)" }} /> {r.name}</label>)}</div><FieldError name="roles" /></div>
          <p className="small muted">They get an email link to set a password and, for Accountant and Super Admin, two-factor sign-in.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><SubmitButton>Send invite</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}
