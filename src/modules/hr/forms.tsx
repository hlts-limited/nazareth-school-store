"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { shrinkImage } from "@/shared/ui/shrink-image";
import { STAFF_DOC_KINDS } from "./docs";

type Action = (s: ActionResult, f: FormData) => Promise<ActionResult>;

/** Phone photos are made smaller before sending, so they stay under the upload limit. */
async function shrinkFile(data: FormData): Promise<FormData | string> {
  const f = data.get("file");
  if (!(f instanceof File) || !f.size) return "Choose a file to upload.";
  if (f.type.startsWith("image/")) {
    try { data.set("file", await shrinkImage(f, data.get("kind") === "passport" ? 900 : 2000, 0.85)); }
    catch { return `${f.name} couldn't be read. Please choose a JPG or PNG photo, or a PDF.`; }
  }
  if ((data.get("file") as File).size > 4 * 1024 * 1024) return "That file is over 4 MB. Please use a smaller PDF or a phone photo.";
  return data;
}

/** Upload a staff document: the staff member for themselves, or HR for them. */
export function StaffDocUpload({ action, employeeId, hr, kinds }: { action: Action; employeeId: string; hr: boolean; kinds?: string[] }) {
  const options = STAFF_DOC_KINDS.filter((k) => (hr || !("hrOnly" in k && k.hrOnly)) && (!kinds || kinds.includes(k.kind)));
  const [kind, setKind] = useState<string>(options[0]?.kind ?? "cv");
  const def = STAFF_DOC_KINDS.find((k) => k.kind === kind);
  return (
    <ActionForm action={action} className="stack tight" resetOnSuccess prepare={shrinkFile}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="grid g2">
        <div className="field">
          <label htmlFor={`kind-${employeeId}`}>Document</label>
          <select className="input" id={`kind-${employeeId}`} name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {options.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          <FieldError name="kind" />
        </div>
        {def?.expires && (
          <div className="field">
            <label htmlFor={`exp-${employeeId}`}>Expiry date (if any)</label>
            <input className="input" id={`exp-${employeeId}`} type="date" name="expiresAt" />
            <span className="hint">You&apos;ll get a reminder 30 days before it lapses.</span>
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor={`file-${employeeId}`}>File</label>
        <input className="input" id={`file-${employeeId}`} type="file" name="file" accept={kind === "passport" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"} />
        <span className="hint">PDF, JPG, PNG or WebP. A clear phone photo of the page is fine.</span>
        <FieldError name="file" />
      </div>
      <div><SubmitButton size="sm" icon="upload">Upload</SubmitButton></div>
    </ActionForm>
  );
}

/** Bank details: the name is filled from Paystack's account check where it can be. */
export function BankForm({ action, employeeId, banks, canCheck }: { action: Action; employeeId: string; banks: { code: string; name: string }[]; canCheck: boolean }) {
  return (
    <ActionForm action={action} className="stack tight" resetOnSuccess>
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="grid g2">
        <div className="field">
          <label htmlFor={`bank-${employeeId}`}>Bank</label>
          <select className="input" id={`bank-${employeeId}`} name="bankCode" defaultValue="">
            <option value="" disabled>Choose…</option>
            {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
          <FieldError name="bankCode" />
        </div>
        <div className="field">
          <label htmlFor={`acct-${employeeId}`}>Account number</label>
          <input className="input mono" id={`acct-${employeeId}`} name="accountNumber" inputMode="numeric" maxLength={10} autoComplete="off" placeholder="10 digits" />
          <FieldError name="accountNumber" />
        </div>
      </div>
      {!canCheck && (
        <div className="field">
          <label htmlFor={`aname-${employeeId}`}>Name on the account</label>
          <input className="input" id={`aname-${employeeId}`} name="accountName" autoComplete="off" />
          <span className="hint">Type it exactly as the bank shows it. The Bursar checks it before any payment.</span>
          <FieldError name="accountName" />
        </div>
      )}
      <div><SubmitButton size="sm" icon="check">{canCheck ? "Check and save" : "Save"}</SubmitButton></div>
    </ActionForm>
  );
}
