import { fmtDateTime } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Kpi, Note, Pill } from "@/shared/ui/primitives";
import type { StaffViewer } from "@/modules/auth";
import { approvalSummary, approveRunAction, payPreview, payRunAction, periodLabel, refreshPaymentsAction, sendBackAction } from "@/modules/payroll";
import { money } from "../_ui";

const PAY_TONE = { PENDING: "warn", SUCCESS: "ok", FAILED: "err", REVERSED: "err" } as const;
const PAY_WORD = { PENDING: "Waiting for Paystack", SUCCESS: "Paid", FAILED: "Failed", REVERSED: "Reversed" } as const;

/** Approval (the Proprietor, never someone who prepared the run) and payment through Paystack. */
export async function ApproveAndPay({ runId, v }: { runId: string; v: StaffViewer }) {
  const s = await approvalSummary(runId);
  const { run, totals: t } = s;
  const canApprove = v.permissions.has("payroll.approve");
  const canPay = v.permissions.has("payroll.pay");
  const prepared = run.preparerIds.includes(v.user.id);
  const recent = Date.now() - new Date(v.session.createdAt).getTime() < 15 * 60_000;
  const preview = (run.status === "APPROVED" || run.status === "PAID") && canPay ? await payPreview(runId) : null;
  const payments = run.items.flatMap((i) => i.payments.map((p) => ({ p, name: `${i.employee.user.firstName} ${i.employee.user.lastName}` }))).sort((a, b) => b.p.createdAt.getTime() - a.p.createdAt.getTime());
  const Code = () => recent ? null : (
    <div className="field"><label htmlFor={`code-${runId}`}>Your 6-digit 2FA code</label><input className="input mono" id={`code-${runId}`} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} style={{ maxWidth: 140 }} /><span className="hint">You signed in more than 15 minutes ago.</span><FieldError name="code" /></div>
  );

  return (
    <section className="card stack">
      <div className="row between"><h3>Approval and payment</h3>{preview && <Pill tone={preview.mode === "live" ? "err" : "info"}>{preview.mode === "live" ? "LIVE" : preview.mode === "test" ? "TEST" : "SIMULATED"}</Pill>}</div>
      <div className="grid g4">
        <Kpi label="Gross" value={money(t.gross)} />
        <Kpi label="Statutory · tax" value={`${money(t.statutory)} · ${money(t.tax)}`} />
        <Kpi label="Penalties" value={money(t.penalties)} />
        <Kpi label="Net to pay" value={money(t.netPayable)} sub={s.change === null ? `${t.staff - t.held} staff` : `${s.change >= 0 ? "+" : "−"}${money(Math.abs(s.change))} on ${periodLabel(s.prevPeriod!)}`} />
      </div>
      {t.held > 0 && <Note tone="warn" icon="alert">Held, not paid: {run.items.filter((i) => i.held).map((i) => `${i.employee.user.firstName} ${i.employee.user.lastName} (${i.heldReason})`).join("; ")}.</Note>}

      {run.status === "DEFAULTS_REVIEWED" && (canApprove ? (prepared ? <Note tone="warn" icon="alert">You worked on this run, so someone else must approve it.</Note> : (
        <div className="grid g2" style={{ alignItems: "start" }}>
          <ActionForm action={approveRunAction} className="stack tight">
            <input type="hidden" name="runId" value={runId} />
            <p className="small muted">An encrypted backup is taken before approving. Approving doesn&apos;t send money: you press Pay next.</p>
            <Code />
            <div><SubmitButton icon="check" confirmText={`Approve ${periodLabel(run.period)} payroll: ${money(t.netPayable)} for ${t.staff - t.held} staff?`}>Approve payroll</SubmitButton></div>
          </ActionForm>
          <ActionForm action={sendBackAction} className="stack tight">
            <input type="hidden" name="runId" value={runId} />
            <label className="lbl" htmlFor="sb-note">Or send it back with a note</label>
            <input className="input" id="sb-note" name="note" placeholder="What needs changing?" /><FieldError name="note" />
            <div><SubmitButton size="sm" variant="ghost">Send back</SubmitButton></div>
          </ActionForm>
        </div>
      )) : <p className="small muted">Waiting for the Proprietor to approve.</p>)}

      {(run.status === "APPROVED" || run.status === "PAID" || run.status === "LOCKED") && (
        <p className="small">Approved by <b>{run.approvedBy}</b> on {fmtDateTime(run.approvedAt!)}.{run.paidAt ? ` Paid ${fmtDateTime(run.paidAt)}.` : ""}</p>
      )}

      {preview && preview.count > 0 && (
        <ActionForm action={payRunAction} className="card stack" >
          <input type="hidden" name="runId" value={runId} />
          <h3>Pay {preview.count} salar{preview.count === 1 ? "y" : "ies"}</h3>
          <dl className="facts">
            <div><dt>Total to send</dt><dd>{money(preview.total)}</dd></div>
            <div><dt>Estimated Paystack fees</dt><dd>{money(preview.fees)}</dd></div>
            <div><dt>Paystack balance</dt><dd>{preview.balance === null ? "Couldn't check" : money(preview.balance)}</dd></div>
          </dl>
          {preview.balance !== null && preview.balance < preview.total + preview.fees && <Note tone="err" icon="alert">The balance is short by {money(preview.total + preview.fees - preview.balance)}. Top up the Paystack balance first; nothing will be sent until it covers the total and fees.</Note>}
          {preview.mode === "live" && <Note tone="warn" icon="alert">LIVE: real money will be sent to staff bank accounts.</Note>}
          <div className="field"><label htmlFor={`cf-${runId}`}>Type the total to confirm ({money(preview.total)})</label><input className="input mono" id={`cf-${runId}`} name="confirm" inputMode="decimal" autoComplete="off" style={{ maxWidth: 200 }} /><FieldError name="confirm" /></div>
          <Code />
          <div><SubmitButton icon="wallet" confirmText={`Send ${money(preview.total)} to ${preview.count} staff now?`}>Pay</SubmitButton></div>
        </ActionForm>
      )}

      {payments.length > 0 && (
        <div className="stack tight">
          <div className="row between"><b>Payments</b>
            <ActionForm action={refreshPaymentsAction}><input type="hidden" name="runId" value={runId} /><SubmitButton size="sm" variant="ghost" icon="refresh">Refresh from Paystack</SubmitButton></ActionForm>
          </div>
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Staff</th><th className="r">Amount</th><th>Status</th><th>Reference</th></tr></thead>
            <tbody>{payments.map(({ p, name }) => (
              <tr key={p.id}>
                <td data-label="Staff">{name}{p.attempt > 1 ? <span className="small muted"> (try {p.attempt})</span> : null}</td>
                <td data-label="Amount" className="r">{money(p.amountKobo)}</td>
                <td data-label="Status"><Pill tone={PAY_TONE[p.status]}>{PAY_WORD[p.status]}</Pill>{p.failReason ? <div className="small" style={{ color: "var(--err)" }}>{p.failReason}</div> : null}{!p.live ? <span className="small muted"> test</span> : null}</td>
                <td data-label="Reference" className="mono small">{p.reference}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {payments.some(({ p }) => p.status === "FAILED" || p.status === "REVERSED") && <p className="small muted">A failed salary is offered again in Pay above once the person&apos;s bank details are fixed and verified.</p>}
        </div>
      )}
    </section>
  );
}
