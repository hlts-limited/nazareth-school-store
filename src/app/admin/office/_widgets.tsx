"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, Dialog, FieldError, SubmitButton, useToast } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

/* Pupils: the pupil table with bulk actions, and bulk import. */

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
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
