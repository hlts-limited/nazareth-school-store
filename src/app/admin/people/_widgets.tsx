"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, Dialog, FieldError, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

/* View as parent / pupil. */

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
export function ViewAsButton({ action, target, name }: { action: Action; target: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}><Icon name="eye" size="sm" /> View as</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`View as ${name}`}>
        <ActionForm action={action} className="stack">
          <div className="note"><Icon name="shield" /><span>You&apos;ll see exactly what they see, without their password. The view is read-only, ends after 30 minutes, and is logged.</span></div>
          <input type="hidden" name="target" value={target} />
          <div className="field"><label htmlFor="va-r">Reason (logged)</label><select className="input" id="va-r" name="reason"><option>Parent called about an order</option><option>Checking a reported problem</option><option>Helping a parent over the phone</option></select></div>
          <div className="field"><label htmlFor="va-c">Your 2FA code</label><input className="input mono" id="va-c" name="code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" /><FieldError name="code" /></div>
          <div className="row justify-end"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><SubmitButton icon="eye">Start viewing</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}

