"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { shrinkImage } from "@/shared/ui/shrink-image";
import { admissionClassFor } from "@/shared/lib/admission-age";
import { DOC_KINDS, RELIGIONS, docLabel } from "./docs";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
type Window = { id: string; session: string; formFee: number };

/** Vercel accepts about 4.5 MB per request; photos are shrunk first, so only large PDFs come near this. */
const MAX_TOTAL = 4.2 * 1024 * 1024;
const MB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Shrink photos in the browser (passport smaller, certificates big enough to read), then check the total size. */
async function prepareDocs(data: FormData): Promise<FormData | string> {
  let total = 0;
  for (const d of DOC_KINDS) {
    const f = data.get(`doc-${d.kind}`);
    if (!(f instanceof File) || !f.size) { data.delete(`doc-${d.kind}`); continue; }
    if (f.type.startsWith("image/")) {
      try { data.set(`doc-${d.kind}`, await shrinkImage(f, d.kind === "passport" ? 900 : 2000, 0.85)); }
      catch { return `${f.name} couldn't be read. Please choose a JPG or PNG photo, or a PDF.`; }
    }
    total += (data.get(`doc-${d.kind}`) as File).size;
  }
  if (total > MAX_TOTAL) return `The documents add up to ${MB(total)}, which is too large to send at once. Use phone photos instead of large PDFs, or smaller PDF files (under ${MB(MAX_TOTAL)} together).`;
  return data;
}

function Field({ id, label, hint, children }: { id: string; label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={`af-${id}`}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
      <FieldError name={id} />
    </div>
  );
}

const text = (id: string, opts: { type?: string; auto?: string; mode?: "tel" | "email" | "text"; placeholder?: string } = {}) => (
  <input className="input" id={`af-${id}`} name={id} type={opts.type ?? "text"} autoComplete={opts.auto ?? "off"} inputMode={opts.mode} placeholder={opts.placeholder} />
);

/**
 * The admission form. "public" is the website (class by age, documents required, declaration);
 * "office" is the back office (choose the session, optionally another class, form-fee handling, documents optional).
 */
export function ApplicationFields({ action, mode, windows, classes = [], submitLabel, cancelHref }: {
  action: Action; mode: "public" | "office"; windows: Window[]; classes?: { id: string; name: string }[]; submitLabel: string; cancelHref: string;
}) {
  const office = mode === "office";
  const [windowId, setWindowId] = useState(windows[0]?.id ?? "");
  const [dob, setDob] = useState("");
  const [religion, setReligion] = useState("");
  const w = windows.find((x) => x.id === windowId) ?? windows[0];
  const byAge = /^\d{4}-\d{2}-\d{2}$/.test(dob) && w ? admissionClassFor(dob, w.session) : null;
  const n = (i: number) => <span className="step-n" aria-hidden="true">{i}</span>;

  return (
    <ActionForm action={action} className="stack loose" prepare={prepareDocs}>
      {!office && <div className="hp" aria-hidden="true"><label htmlFor="af-website">Leave this empty</label><input id="af-website" name="website" tabIndex={-1} autoComplete="off" /></div>}

      {office && (
        <fieldset className="card stack">
          <legend>{n(0)}Registration</legend>
          <div className="grid g2">
            <Field id="windowId" label="Admission session">
              <select className="input" id="af-windowId" name="windowId" value={windowId} onChange={(e) => setWindowId(e.target.value)}>
                {windows.map((x) => <option key={x.id} value={x.id}>{x.session}{x.formFee ? ` · form fee ₦${x.formFee.toLocaleString()}` : ""}</option>)}
              </select>
            </Field>
            <Field id="fee" label="Form fee" hint={w?.formFee ? undefined : "This session has no form fee."}>
              <select className="input" id="af-fee" name="fee" defaultValue={w?.formFee ? "paid" : "waived"}>
                <option value="paid">Paid at the school office</option>
                <option value="online">Family will pay online (Paystack)</option>
                <option value="waived">Waived</option>
              </select>
            </Field>
          </div>
        </fieldset>
      )}

      <fieldset className="card stack">
        <legend>{n(1)}The child</legend>
        <div className="grid g2">
          <Field id="surname" label="Surname">{text("surname")}</Field>
          <Field id="otherNames" label="Other names">{text("otherNames")}</Field>
          <Field id="dateOfBirth" label="Date of birth">
            <input className="input" id="af-dateOfBirth" name="dateOfBirth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </Field>
          <Field id="gender" label="Gender">
            <select className="input" id="af-gender" name="gender" defaultValue=""><option value="">Choose…</option><option>Female</option><option>Male</option></select>
          </Field>
          <div className="field">
            <span className="lbl">Class</span>
            <div className={`age-class ${byAge?.problem ? "bad" : ""}`} aria-live="polite">
              {!byAge ? <span className="muted">Chosen by age once you enter the date of birth.</span>
                : byAge.className ? <><b>{byAge.className}</b><span className="small muted"> · age {byAge.age} on 1 September {byAge.on.slice(0, 4)}</span></>
                  : <span>{byAge.problem}</span>}
            </div>
            {office && (
              <select className="input" id="af-classId" name="classId" defaultValue="" aria-label="Class override" style={{ marginTop: 8 }}>
                <option value="">Use the class by age</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <FieldError name="classId" />
          </div>
          <Field id="previousSchool" label="Current or last school (if any)">{text("previousSchool")}</Field>
          <Field id="currentClass" label="Current class (if any)">{text("currentClass")}</Field>
          <Field id="religion" label="Religion">
            <select className="input" id="af-religion" name="religion" value={religion} onChange={(e) => setReligion(e.target.value)}>
              <option value="">Choose…</option>{RELIGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field id="nationality" label="Nationality">{text("nationality", { placeholder: "Nigerian" })}</Field>
          <Field id="stateOfOrigin" label="State of origin">{text("stateOfOrigin")}</Field>
          <Field id="languages" label="Languages spoken">{text("languages", { placeholder: "e.g. English, Yoruba" })}</Field>
        </div>
      </fieldset>

      <fieldset className="card stack">
        <legend>{n(2)}Parent or guardian</legend>
        <div className="grid g2">
          <Field id="parentName" label="Full name">{text("parentName", { auto: office ? "off" : "name" })}</Field>
          <Field id="relationship" label="Relationship to the child">
            <select className="input" id="af-relationship" name="relationship" defaultValue=""><option value="">Choose…</option><option>Mother</option><option>Father</option><option>Guardian</option></select>
          </Field>
          <Field id="parentPhone" label="Phone number" hint="Used for the exam date, the result, and to link brothers and sisters.">{text("parentPhone", { type: "tel", auto: office ? "off" : "tel", mode: "tel", placeholder: "0803 123 4567" })}</Field>
          <Field id="parentEmail" label="Email (optional)" hint="For the Paystack receipt and School Store invite.">{text("parentEmail", { type: "email", auto: office ? "off" : "email", mode: "email" })}</Field>
          <Field id="occupation" label="Occupation">{text("occupation")}</Field>
          <Field id="otherParentName" label="Other parent's name (optional)">{text("otherParentName")}</Field>
          <Field id="otherParentPhone" label="Other parent's phone (optional)">{text("otherParentPhone", { type: "tel", mode: "tel" })}</Field>
        </div>
        <Field id="address" label="Home address">
          <textarea className="input" id="af-address" name="address" rows={2} autoComplete={office ? "off" : "street-address"} />
        </Field>
      </fieldset>

      <fieldset className="card stack">
        <legend>{n(3)}Documents</legend>
        <p className="small muted">{office ? "Add them now or later from the application page. " : "All three are required. "}Photos taken with a phone are fine: they are made smaller before sending. PDFs are accepted for the certificates.</p>
        <div className="grid g3">
          {DOC_KINDS.map((d) => (
            <Field key={d.kind} id={`doc-${d.kind}`} label={docLabel(d.kind, religion || null)} hint={d.kind === "passport" ? "A clear, recent photo of the child's face" : "Photo or PDF"}>
              <input className="input" id={`af-doc-${d.kind}`} name={`doc-${d.kind}`} type="file" accept={d.kind === "passport" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"} />
            </Field>
          ))}
        </div>
      </fieldset>

      <fieldset className="card stack">
        <legend>{n(4)}Health{office ? "" : " and declaration"}</legend>
        <Field id="health" label="Health, sight, speech or learning needs (optional)" hint="Anything the school should know to care for the child, e.g. allergies or support needed.">
          <textarea className="input" id="af-health" name="health" rows={3} />
        </Field>
        {!office && (
          <>
            <label className="check">
              <input type="checkbox" name="declaration" />
              <span>I confirm the information above is true. If my child is ill or injured at school, I agree they may receive treatment at the nearest approved medical centre at my expense. I agree that the school may store this information to process the application (Nigeria Data Protection Act 2023).</span>
            </label>
            <FieldError name="declaration" />
          </>
        )}
      </fieldset>

      <div className="row">
        <SubmitButton size="lg" disabled={!!byAge?.problem && !office}>{submitLabel}</SubmitButton>
        <Link className="btn lg" href={cancelHref}>Cancel</Link>
      </div>
    </ActionForm>
  );
}
