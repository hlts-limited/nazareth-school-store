"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { shrinkImage } from "@/shared/ui/shrink-image";

type Action = (s: ActionResult, f: FormData) => Promise<ActionResult>;

/** A phone photo of the affidavit is made smaller before sending, so it stays under the upload limit. */
async function prepare(data: FormData): Promise<FormData | string> {
  const f = data.get("affidavit");
  if (!(f instanceof File) || !f.size) { data.delete("affidavit"); return data; }
  if (f.type.startsWith("image/")) {
    try { data.set("affidavit", await shrinkImage(f, 2200, 0.85)); }
    catch { return `${f.name} couldn't be read. Please choose a JPG or PNG photo, or a PDF.`; }
  }
  if ((data.get("affidavit") as File).size > 4 * 1024 * 1024) return "The affidavit file is over 4 MB. Please use a phone photo or a smaller PDF.";
  return data;
}

/** Correct the child's name or date of birth. The affidavit field is required as soon as anything is changed. */
export function CorrectChildForm({ action, id, surname, otherNames, dateOfBirth }: { action: Action; id: string; surname: string; otherNames: string; dateOfBirth: string }) {
  const [v, setV] = useState({ surname, otherNames, dateOfBirth });
  const changed = v.surname.trim() !== surname || v.otherNames.trim() !== otherNames || v.dateOfBirth !== dateOfBirth;
  return (
    <ActionForm action={action} className="stack tight" prepare={prepare}>
      <input type="hidden" name="id" value={id} />
      <div className="grid g2">
        <div className="field">
          <label htmlFor="cc-surname">Surname</label>
          <input className="input" id="cc-surname" name="surname" value={v.surname} onChange={(e) => setV({ ...v, surname: e.target.value })} />
          <FieldError name="surname" />
        </div>
        <div className="field">
          <label htmlFor="cc-other">Other names</label>
          <input className="input" id="cc-other" name="otherNames" value={v.otherNames} onChange={(e) => setV({ ...v, otherNames: e.target.value })} />
          <FieldError name="otherNames" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="cc-dob">Date of birth</label>
        <input className="input" id="cc-dob" type="date" name="dateOfBirth" value={v.dateOfBirth} onChange={(e) => setV({ ...v, dateOfBirth: e.target.value })} />
        <span className="hint">A new date of birth re-checks the class by age.</span>
        <FieldError name="dateOfBirth" />
      </div>
      {changed && (
        <div className="field">
          <label htmlFor="cc-aff">Sworn affidavit (required)</label>
          <input className="input" id="cc-aff" type="file" name="affidavit" accept="image/jpeg,image/png,image/webp,application/pdf" />
          <span className="hint">A clear photo or PDF of the sworn affidavit for this change. It is kept with the application.</span>
          <FieldError name="affidavit" />
        </div>
      )}
      <div><SubmitButton size="sm" variant="default" icon="check" disabled={!changed}>Save correction</SubmitButton></div>
    </ActionForm>
  );
}
