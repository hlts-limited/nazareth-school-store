import Link from "next/link";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { PageHeader } from "@/shared/ui/primitives";
import { requireStaff } from "@/modules/auth";
import { listRuns, periodLabel, startRunAction } from "@/modules/payroll";
import { RunStatus } from "./_ui";
import { DataTable } from "@/shared/ui/data-table";
import { keyed } from "@/shared/ui/table-cells";
import { PaystackStatus } from "./_paystack";

export const metadata = { title: "Payroll" };

export default async function PayrollRunsPage() {
  const v = await requireStaff("payroll.view");
  const runs = await listRuns();
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const canRun = v.permissions.has("payroll.run");
  return (
    <>
      <PageHeader title="Payroll" sub="Each month: Accounts calculates and reviews three stages (statutory, tax, penalties), then the Super Admin approves and pays." actions={<PaystackStatus />} />
      <div className="stack">
        {canRun && !runs.some((r) => r.period === thisMonth) && (
          <ActionForm action={startRunAction} className="card row tight">
            <label className="lbl" htmlFor="pr-m">Start payroll for</label>
            <input className="input mw-190" id="pr-m" type="month" name="period" defaultValue={thisMonth} max={thisMonth} />
            <SubmitButton icon="plus">Start</SubmitButton>
            <FieldError name="period" />
          </ActionForm>
        )}
        <section className="card pad-0">
          <DataTable
            empty="No payroll yet" emptyText={canRun ? "Start this month's payroll above." : "Accounts starts each month's payroll."}
            columns={[{ label: "Month", sortable: true }, { label: "Staff", sortable: true }, { label: "Status", sortable: true }, { label: "", right: true }]}
            rows={runs.map((r) => ({
              id: r.id,
              sort: [r.period, r._count.items, r.status, null],
              cells: keyed([
                <Link key="m" href={`/admin/payroll/${r.period}`}><b>{periodLabel(r.period)}</b></Link>,
                r._count.items || "—",
                <RunStatus key="s" s={r.status} />,
                <Link key="o" className="btn sm" href={`/admin/payroll/${r.period}`}>Open</Link>,
              ]),
            }))}
          />
        </section>
      </div>
    </>
  );
}
