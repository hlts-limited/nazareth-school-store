"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, Dialog, FieldError, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

/* Accounts: checking transfer receipts and adjusting pupil wallets. */

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
const n = (v: number) => `${v < 0 ? "−" : ""}₦${Math.abs(Math.round(v)).toLocaleString("en-NG")}`;
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
          : diff < 0 ? <div className="note warn"><Icon name="alert" /><span>Short by <b>{n(-diff)}</b>. Confirming marks the order <b>Part paid</b> and tells {parentFirst} the balance by WhatsApp and email.</span></div>
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
          <div className="row justify-end"><button type="button" className="btn ghost" onClick={() => setRejectOpen(false)}>Cancel</button><SubmitButton variant="danger">Reject and notify parent</SubmitButton></div>
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
          <div className="row justify-end"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><SubmitButton>Save and log</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}
