"use client";

import { useEffect, useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, Dialog, FieldError, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

/* Staff & roles: invite staff and change roles. */

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
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
          <p className="small muted">They get an email link to set a password and, for Accounts, HR and Super Admin, two-factor sign-in.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><SubmitButton>Send invite</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

/**
 * The role ticks for one person. Ticks only count once saved, so as soon as they differ from what's saved a clear
 * Save changes button and a "Not saved yet" note appear, and leaving the page asks first.
 */
export function RolesForm({ action, userId, roles, current }: { action: Action; userId: string; roles: { id: string; name: string }[]; current: string[] }) {
  const [saved, setSaved] = useState(current);
  const [ticked, setTicked] = useState(current);
  const dirty = saved.length !== ticked.length || saved.some((r) => !ticked.includes(r));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <ActionForm action={action} className={`roles-form${dirty ? " dirty" : ""}`} onDone={(r) => { if (r.ok) setSaved(ticked); }}>
      <input type="hidden" name="userId" value={userId} />
      {roles.map((r) => (
        <label key={r.id} className="check small">
          <input type="checkbox" name="roles" value={r.id} autoComplete="off" checked={ticked.includes(r.id)}
            onChange={(e) => setTicked(e.target.checked ? [...ticked, r.id] : ticked.filter((x) => x !== r.id))} /> {r.name}
        </label>
      ))}
      {dirty && (
        <div className="roles-save">
          <span className="small" role="status">Not saved yet</span>
          <SubmitButton size="sm" variant="primary">Save changes</SubmitButton>
          <button type="button" className="btn ghost sm" onClick={() => setTicked(saved)}>Undo</button>
        </div>
      )}
    </ActionForm>
  );
}
