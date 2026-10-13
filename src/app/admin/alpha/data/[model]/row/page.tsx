import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Field, Note, PageHeader } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import {
  MODELS, createRowAction, deleteRowAction, editableFields, getRow, setPasswordAction, show, signOutEverywhereAction, updateRowAction, type FieldInfo,
} from "@/modules/alpha";

export const metadata = { title: "Row" };

const hint = (f: FieldInfo) => {
  const t = f.isList ? `${f.type} list (JSON)` : f.kind === "enum" ? "choice" : f.type;
  return `${t}${f.isRequired ? "" : " · optional, leave empty for none"}${f.type === "DateTime" ? " · e.g. 2026-10-13T09:00:00.000Z" : ""}`;
};

function Input({ f, value }: { f: FieldInfo; value: string }) {
  const id = `f-${f.name}`;
  const name = `f.${f.name}`;
  if (f.kind === "enum" || f.type === "Boolean") {
    const opts = f.kind === "enum" ? f.enumValues ?? [] : ["true", "false"];
    return (
      <select className="input" id={id} name={name} defaultValue={value}>
        {!f.isRequired && <option value="">(none)</option>}
        {f.isRequired && !value && <option value="">Choose…</option>}
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (f.type === "Json" || f.isList || value.length > 80) return <textarea className="input" id={id} name={name} defaultValue={value} rows={Math.min(12, Math.max(3, Math.ceil(value.length / 70)))} />;
  return <input className="input" id={id} name={name} defaultValue={value} inputMode={["Int", "Float", "Decimal", "BigInt"].includes(f.type) ? "decimal" : undefined} />;
}

export default async function RowPage({ params, searchParams }: { params: Promise<{ model: string }>; searchParams: Promise<{ k?: string; new?: string }> }) {
  const me = await requireStaff("system.alpha");
  const { model } = await params;
  const m = MODELS.find((x) => x.name === model);
  if (!m) notFound();
  const sp = await searchParams;
  const creating = sp.new === "1";
  if (creating && m.readOnly) notFound();
  const row = creating ? null : sp.k ? await getRow(m, sp.k).catch(() => null) : null;
  if (!creating && !row) notFound();
  const fields = editableFields(m, creating);
  const locked = m.fields.filter((f) => !fields.includes(f));
  const back = <Link href={`/admin/alpha/data/${m.name}`}>{m.name}</Link>;

  return (
    <>
      <PageHeader title={creating ? `New ${m.name}` : `${m.name} row`} sub={<><Link href="/admin/alpha/data">Data explorer</Link> · {back}</>} />
      <div className="stack loose">
        {m.readOnly && <Note icon="shield">{m.readOnly}</Note>}
        {!creating && locked.length > 0 && (
          <Card className="stack tight">
            <h3>Fixed fields</h3>
            {locked.map((f) => (
              <div key={f.name} className="row between nowrap" style={{ gap: 12 }}>
                <span className="small muted">{f.name}</span>
                <span className="small mono" style={{ overflowWrap: "anywhere", textAlign: "right" }}>{show(f.name, row![f.name]) || "—"}</span>
              </div>
            ))}
            <p className="tiny muted">The row&apos;s key and automatic timestamps can&apos;t be edited. Secrets are hidden{m.name === "User" ? "; use Set password below" : ""}.</p>
          </Card>
        )}

        {(!m.readOnly || creating) ? (
          <Card>
            <ActionForm action={creating ? createRowAction : updateRowAction} className="stack">
              <input type="hidden" name="model" value={m.name} />
              {!creating && <input type="hidden" name="key" value={sp.k} />}
              {fields.map((f) => (
                <Field key={f.name} label={<>{f.name}{f.isRequired && !f.hasDefault ? " *" : ""}</>} htmlFor={`f-${f.name}`} hint={hint(f)}>
                  <Input f={f} value={row ? show(f.name, row[f.name]) : ""} />
                </Field>
              ))}
              {creating && <p className="tiny muted">Leave a field empty to use its default (for example a new id or the current time).</p>}
              <div className="row"><SubmitButton icon={creating ? "plus" : "check"}>{creating ? "Add row" : "Save changes"}</SubmitButton></div>
            </ActionForm>
          </Card>
        ) : (
          <Card className="stack tight">
            {fields.map((f) => (
              <div key={f.name} className="row between nowrap" style={{ gap: 12 }}>
                <span className="small muted">{f.name}</span>
                <span className="small mono" style={{ overflowWrap: "anywhere", textAlign: "right" }}>{show(f.name, row![f.name]) || "—"}</span>
              </div>
            ))}
          </Card>
        )}

        {!creating && m.name === "User" && (
          <div className="grid g2" style={{ alignItems: "start" }}>
            <Card>
              <ActionForm action={setPasswordAction} className="stack" resetOnSuccess>
                <h3>Set password</h3>
                <p className="small muted">Sets a new password for this account and signs them out everywhere. Confirm with your own 2FA code.</p>
                <input type="hidden" name="userId" value={String(row!.id)} />
                <Field label="New password" htmlFor="sp-pw"><input className="input" id="sp-pw" name="password" type="password" autoComplete="new-password" /></Field>
                <Field label="Your 2FA code" htmlFor="sp-code"><input className="input" id="sp-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} /></Field>
                <div className="row"><SubmitButton icon="shield">Set password</SubmitButton></div>
              </ActionForm>
            </Card>
            {String(row!.id) !== me.user.id && (
              <Card>
                <ActionForm action={signOutEverywhereAction} className="stack">
                  <h3>Sign out everywhere</h3>
                  <p className="small muted">Ends every session this account has on any device.</p>
                  <input type="hidden" name="userId" value={String(row!.id)} />
                  <div className="row"><SubmitButton icon="logout" variant="danger">Sign out everywhere</SubmitButton></div>
                </ActionForm>
              </Card>
            )}
          </div>
        )}

        {!creating && !m.readOnly && (
          <Card>
            <ActionForm action={deleteRowAction} className="stack">
              <h3>Delete this row</h3>
              <p className="small muted">This can&apos;t be undone (except by restoring a backup). Rows that other rows depend on can&apos;t be deleted until those are removed.</p>
              <input type="hidden" name="model" value={m.name} />
              <input type="hidden" name="key" value={sp.k} />
              <Field label="Type DELETE to confirm" htmlFor="del-confirm"><input className="input" id="del-confirm" name="confirm" autoComplete="off" style={{ maxWidth: 220 }} /></Field>
              <div className="row"><SubmitButton icon="trash" variant="danger">Delete row</SubmitButton></div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
