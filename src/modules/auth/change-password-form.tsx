import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** Change your own password. Staff with 2FA also confirm with a code. */
export function ChangePasswordForm({ action, needCode, minLength, disabled = false }: { action: Action; needCode: boolean; minLength: number; disabled?: boolean }) {
  return (
    <ActionForm action={action} className="stack" resetOnSuccess>
      <div className="field"><label htmlFor="cp-cur">Current password</label><input className="input" id="cp-cur" name="current" type="password" autoComplete="current-password" required disabled={disabled} /><FieldError name="current" /></div>
      <div className="field"><label htmlFor="cp-new">New password</label><input className="input" id="cp-new" name="password" type="password" autoComplete="new-password" minLength={minLength} required disabled={disabled} />
        <span className="hint">At least {minLength} characters, with a letter and a number. Don&apos;t reuse a password from another site.</span><FieldError name="password" /></div>
      <div className="field"><label htmlFor="cp-cf">Confirm new password</label><input className="input" id="cp-cf" name="confirm" type="password" autoComplete="new-password" required disabled={disabled} /><FieldError name="confirm" /></div>
      {needCode && <div className="field"><label htmlFor="cp-code">6-digit code from your authenticator app</label><input className="input mono" id="cp-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} style={{ maxWidth: 160 }} required disabled={disabled} /><FieldError name="code" /></div>}
      <div className="row"><SubmitButton disabled={disabled}>Change password</SubmitButton></div>
      <p className="small muted">Your other devices are signed out, and you&apos;ll get an email confirming the change.</p>
    </ActionForm>
  );
}
