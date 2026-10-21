import Link from "next/link";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Card, Note, PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { freshPreview, startFreshAction } from "@/modules/alpha";

export const metadata = { title: "Start fresh" };
export const dynamic = "force-dynamic";

const n = (v: number, one: string, many = `${one}s`) => `${v.toLocaleString()} ${v === 1 ? one : many}`;

export default async function StartFreshPage() {
  await requireStaff("system.alpha");
  const p = await freshPreview();
  const r = p.remove;
  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Start fresh" sub="Clear the test and demo data so the school starts with an empty store and no pupils." />
      <div className="stack loose">
        <Note tone="warn" icon="alert">
          This deletes data for everyone. A full backup is saved first, so it can be put back from{" "}
          <Link href="/admin/alpha/backups">Backups &amp; restores</Link> if needed.
        </Note>
        <div className="grid g2" style={{ alignItems: "start" }}>
          <Card className="stack tight">
            <h3>Deleted</h3>
            <ul className="fresh-list">
              <li>{n(r.pupils, "pupil")} and their wallets</li>
              <li>{n(r.parents, "parent account")}</li>
              <li>{n(r.items, "store item")}, their sizes, stock and photos</li>
              <li>{n(r.orders, "order")}, {n(r.payments, "payment")}, receipts, invoices and pick-ups</li>
              <li>{n(r.applications, "admission application")}, exam slots and admission windows</li>
              <li>{n(r.demoStaff, "demo staff account")} (the example.com ones)</li>
              <li>Parent and pupil sign-ins; order numbers start again</li>
            </ul>
          </Card>
          <Card className="stack tight">
            <h3>Kept</h3>
            <ul className="fresh-list">
              <li>The Super Admin and Alpha Admin accounts</li>
              <li>{n(p.keep.staff, "staff account")} with their staff records, attendance and payroll</li>
              <li>Settings, classes, store categories and roles</li>
              <li>Website content: {n(p.keep.events, "event")}, {n(p.keep.news, "news post", "news posts")}, {n(p.keep.photos, "gallery photo")}, notices and messages</li>
              <li>Backups and the audit log</li>
            </ul>
          </Card>
        </div>
        {p.demoStaffDisabled.length > 0 && (
          <Note icon="info">These demo accounts have staff records, so they are switched off instead of deleted: {p.demoStaffDisabled.join(", ")}.</Note>
        )}
        <ActionForm action={startFreshAction} className="card stack">
          <h3>Confirm</h3>
          <div className="grid g2">
            <div className="field">
              <label htmlFor="sf-confirm">Type START FRESH</label>
              <input className="input" id="sf-confirm" name="confirm" autoComplete="off" placeholder="START FRESH" />
              <FieldError name="confirm" />
            </div>
            <div className="field">
              <label htmlFor="sf-code">Your 2FA code</label>
              <input className="input" id="sf-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
              <FieldError name="code" />
            </div>
          </div>
          <div><SubmitButton variant="danger" icon="trash" confirmText="Delete all store, pupil and admissions data now? A backup is saved first.">Start fresh</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}
