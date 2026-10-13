"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ResultLookup } from "@/modules/admissions";
import { Icon } from "@/shared/ui/icon";

type Action = (prev: ResultLookup, form: FormData) => Promise<ResultLookup>;

const OUTCOME: Record<string, [string, string, string]> = {
  ADMITTED: ["ok", "Admitted", "Congratulations! Please visit the school office to complete enrolment."],
  WAITLISTED: ["warn", "Waiting list", "We will contact you if a place becomes available."],
  NOT_ADMITTED: ["err", "Not admitted", "We are unable to offer a place this time. Thank you for applying."],
  WITHDRAWN: ["warn", "Withdrawn", "This application was withdrawn. Contact the school office if this is a mistake."],
};

const when = (d: Date) => new Date(d).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

function Check() {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>{pending ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icon name="search" size="sm" />}Check result</button>;
}

export function ResultLookupForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, { ok: false });
  const r = state.result;
  const o = r?.outcome ? OUTCOME[r.outcome] : null;
  return (
    <div className="stack">
      <form key={JSON.stringify(state.values ?? {})} action={formAction} className="card stack" noValidate>
        <div className="grid lookup-grid">
          <div className="field">
            <label htmlFor="rl-n">Application number</label>
            <input className="input mono" id="rl-n" name="number" placeholder="NZA27-7K3QXM" defaultValue={state.values?.number} autoComplete="off" autoCapitalize="characters" />
            {state.fieldErrors?.number && <span className="field-error">{state.fieldErrors.number}</span>}
          </div>
          <div className="field">
            <label htmlFor="rl-i">First letter of surname</label>
            <input className="input" id="rl-i" name="initial" maxLength={1} defaultValue={state.values?.initial} autoComplete="off" autoCapitalize="characters" style={{ maxWidth: 90 }} />
            {state.fieldErrors?.initial && <span className="field-error">{state.fieldErrors.initial}</span>}
          </div>
        </div>
        <div><Check /></div>
        {!state.ok && state.message && <div className="note err" role="alert"><Icon name="alert" /><span>{state.message}</span></div>}
      </form>

      {r && (
        <div className="card stack" aria-live="polite">
          <div className="row between">
            <div className="stack tight"><span className="eyebrow">{r.number} · {r.session}</span><h2>{r.firstName}, {r.className}</h2></div>
            {o ? <span className={`pill ${o[0]}`}>{o[1]}</span> : <span className="pill plain">Result not published yet</span>}
          </div>
          {o ? <p>{o[2]}</p> : <p className="muted">Results for this session have not been published yet. Please check again later.</p>}
          {r.exam && !o && <div className="note"><Icon name="clock" /><span>Entrance assessment: <b>{when(r.exam.startsAt)}</b> at {r.exam.venue}.</span></div>}
        </div>
      )}
    </div>
  );
}
