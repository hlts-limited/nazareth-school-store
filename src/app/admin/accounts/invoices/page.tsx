import Link from "next/link";
import { fmtDate, isoDay, naira } from "@/shared/lib/format";
import { Card, Empty, PageHeader, Pill } from "@/shared/ui/primitives";
import { Icon } from "@/shared/ui/icon";
import { requireStaff } from "@/modules/auth";
import { listClasses } from "@/modules/catalogue";
import { INVOICE_LABELS, type InvoiceLabel } from "@/modules/orders";
import { invoiceRows } from "@/modules/payments";

export const metadata = { title: "Invoices" };

const TONE: Record<InvoiceLabel, "ok" | "info" | "warn" | "err" | "plain"> = { Approved: "ok", Pending: "info", "Part paid": "warn", Rejected: "err", Cancelled: "plain" };

function monthStart() { const d = isoDay(); return d.slice(0, 8) + "01"; }
function weekStart() { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return isoDay(d); }

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ cls?: string; from?: string; to?: string; status?: string; q?: string }> }) {
  await requireStaff("invoices.manage");
  const sp = await searchParams;
  const today = isoDay();
  const f = {
    classId: sp.cls || undefined,
    from: sp.from ?? monthStart(),
    to: sp.to ?? today,
    status: (INVOICE_LABELS as string[]).includes(sp.status ?? "") ? (sp.status as InvoiceLabel) : undefined,
    q: sp.q || undefined,
  };
  const [classes, rows] = await Promise.all([listClasses(), invoiceRows(f)]);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const qs = new URLSearchParams({ ...(f.classId ? { cls: f.classId } : {}), from: f.from, to: f.to, ...(f.status ? { status: f.status } : {}), ...(f.q ? { q: f.q } : {}) }).toString();
  const range = (from: string, to: string) => `/admin/accounts/invoices?${new URLSearchParams({ ...(f.classId ? { cls: f.classId } : {}), from, to, ...(f.status ? { status: f.status } : {}) })}`;
  const shown = rows.slice(0, 100);

  return (
    <>
      <PageHeader title="Invoices" sub="One row per pupil, so class totals add up." actions={
        <>
          <a className="btn primary" href={`/api/admin/invoices/export?format=xlsx&${qs}`}><Icon name="download" size="sm" /> Excel</a>
          <a className="btn" href={`/api/admin/invoices/export?format=csv&${qs}`}>CSV</a>
          <a className="btn" href={`/api/admin/invoices/export?format=pdf&${qs}`}>PDF</a>
        </>
      } />
      <div className="stack">
        <form className="card stack" method="get">
          <div className="grid g4" style={{ alignItems: "end" }}>
            <div className="field"><label htmlFor="f-cls">Class</label>
              <select className="input" id="f-cls" name="cls" defaultValue={f.classId ?? ""}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label htmlFor="f-from">Start date</label><input className="input" type="date" id="f-from" name="from" defaultValue={f.from} max={today} /></div>
            <div className="field"><label htmlFor="f-to">End date</label><input className="input" type="date" id="f-to" name="to" defaultValue={f.to} max={today} /></div>
            <div className="field"><label htmlFor="f-st">Status</label>
              <select className="input" id="f-st" name="status" defaultValue={f.status ?? ""}><option value="">All statuses</option>{INVOICE_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div className="row">
            <div className="search grow" style={{ minWidth: 220 }}><Icon name="search" size="sm" /><input className="input" name="q" defaultValue={f.q} placeholder="Invoice no, parent or pupil name, reg number" /></div>
            <button className="btn primary" type="submit">Apply filters</button>
            <Link className="btn ghost" href="/admin/accounts/invoices">Clear</Link>
          </div>
          <div className="chips">
            {([["Today", today, today], ["This week", weekStart(), today], ["This month", monthStart(), today]] as const).map(([l, a, b]) => (
              <Link key={l} className={`chip ${f.from === a && f.to === b ? "on" : ""}`} href={range(a, b)}>{l}</Link>
            ))}
          </div>
        </form>
        <div className="row between"><span><b className="tnum">{rows.length}</b> <span className="muted">invoice rows</span></span><span className="muted">Total <b className="tnum" style={{ color: "var(--ink)", fontSize: 16 }}>{naira(total)}</b></span></div>
        <Card pad={false}>
          {rows.length === 0 ? <Empty title="No invoices match">Widen the dates or clear the filters.</Empty> : (
            <div className="tbl-wrap">
              <table className="t rt">
                <thead><tr><th>Invoice</th><th>Date</th><th>Parent</th><th>Pupil</th><th>Class</th><th>Method</th><th className="r">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={`${r.invoice}-${r.regNumber}`}>
                      <td data-label="Invoice" className="mono">{r.invoice}</td><td data-label="Date">{fmtDate(r.date)}</td><td data-label="Parent">{r.parent}</td>
                      <td data-label="Pupil">{r.pupil}</td><td data-label="Class">{r.className}</td><td data-label="Method">{r.method}</td>
                      <td data-label="Amount" className="r tnum">{naira(r.amount)}</td><td data-label="Status"><Pill tone={TONE[r.status]}>{r.status}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > shown.length && <div className="card-b small muted">Showing {shown.length} of {rows.length}. Exports include every row.</div>}
        </Card>
      </div>
    </>
  );
}
