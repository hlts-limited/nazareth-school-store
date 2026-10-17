"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, FieldError, SubmitButton, useFormResult } from "@/shared/ui/client";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

function FormMessage() {
  const r = useFormResult();
  return !r.ok && r.message ? <div className="note err" role="alert"><span>{r.message}</span></div> : null;
}

/** After repeated failures the server starts asking a check question: reload to show it. */
function RefreshForCaptcha({ shown }: { shown: boolean }) {
  const r = useFormResult();
  const router = useRouter();
  useEffect(() => { if (!r.ok && r.message && !shown) router.refresh(); }, [r, shown, router]);
  return null;
}

export function LoginForms({ initialTab, captcha, actions }: {
  initialTab: "parent" | "pupil" | "staff";
  captcha: { question: string; token: string } | null;
  actions: { parent: Action; pupil: Action; staff: Action };
}) {
  const [tab, setTab] = useState(initialTab);
  return (
    <>
      <div className="seg" role="tablist" aria-label="Who is signing in">
        {(["parent", "pupil", "staff"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "parent" ? "Parent" : t === "pupil" ? "Pupil" : "Staff"}
          </button>
        ))}
      </div>

      {tab === "parent" && (
        <ActionForm action={actions.parent} className="stack">
          <FormMessage />
          <div className="field"><label htmlFor="lp-id">Phone number or email</label><input className="input" id="lp-id" name="id" autoComplete="username" required /><FieldError name="id" /></div>
          <div className="field"><label htmlFor="lp-pw">Password</label><input className="input" id="lp-pw" name="password" type="password" autoComplete="current-password" required /><FieldError name="password" /></div>
          <label className="check small"><input type="checkbox" name="remember" /> Remember this device for 30 days</label>
          <SubmitButton size="lg" block>Sign in</SubmitButton>
          <p className="small muted">New parent? Use the link in the invite SMS from the school office to set your password. Forgot it? Ask the office to send you a new link.</p>
        </ActionForm>
      )}

      {tab === "pupil" && (
        <ActionForm action={actions.pupil} className="stack">
          <FormMessage />
          <RefreshForCaptcha shown={!!captcha} />
          <div className="field"><label htmlFor="lu-sn">Surname</label><input className="input" id="lu-sn" name="surname" autoComplete="username" placeholder="e.g. Adeyemi" required /><FieldError name="surname" /></div>
          <div className="field"><label htmlFor="lu-reg">Registration number</label><input className="input" id="lu-reg" name="reg" type="password" autoComplete="current-password" placeholder="e.g. NAZ/2019/014" required /><FieldError name="reg" /></div>
          <div className="field"><label htmlFor="lu-pin">PIN <span className="muted">(only if your parent set one)</span></label><input className="input" id="lu-pin" name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="off" /></div>
          {captcha && (
            <div className="field">
              <label htmlFor="lu-cap">{captcha.question}</label>
              <input className="input" id="lu-cap" name="captcha" inputMode="numeric" required style={{ maxWidth: 120 }} />
              <input type="hidden" name="captchaToken" value={captcha.token} />
              <FieldError name="captcha" />
            </div>
          )}
          <SubmitButton size="lg" block>Sign in to pupil dashboard</SubmitButton>
        </ActionForm>
      )}

      {tab === "staff" && (
        <ActionForm action={actions.staff} className="stack">
          <FormMessage />
          <div className="field"><label htmlFor="ls-id">Staff email</label><input className="input" id="ls-id" name="email" type="email" autoComplete="username" required /><FieldError name="email" /></div>
          <div className="field"><label htmlFor="ls-pw">Password</label><input className="input" id="ls-pw" name="password" type="password" autoComplete="current-password" required /><FieldError name="password" /></div>
          <div className="field"><label htmlFor="ls-2fa">2FA code <span className="muted">(Accountant and Super Admin)</span></label><input className="input mono" id="ls-2fa" name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" /><FieldError name="code" /></div>
          <SubmitButton variant="dark" size="lg" block>Sign in to back office</SubmitButton>
        </ActionForm>
      )}
    </>
  );
}
