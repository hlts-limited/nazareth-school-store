"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, CopyButton, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
type Link = { link: string; number: string; phone: string };

const intl = (phone: string) => (phone.startsWith("0") ? `234${phone.slice(1)}` : phone);

/** Make a new private link for the family and send it on WhatsApp or copy it. */
export function FamilyLink({ id, action, school }: { id: string; action: Action; school: string }) {
  const [got, setGot] = useState<Link | null>(null);
  const message = got ? `Hello, this is ${school}. Here is your private application page (${got.number}) to see the exam date and result and to upload documents: ${got.link}` : "";
  return (
    <div className="stack tight">
      {got ? (
        <>
          <input className="input mono small" readOnly value={got.link} aria-label="Family link" onFocus={(e) => e.target.select()} />
          <div className="row tight">
            <a className="btn sm" href={`https://wa.me/${intl(got.phone)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><Icon name="chat" size="sm" />Send on WhatsApp</a>
            <CopyButton text={got.link} label="Copy link" done="Link copied" />
          </div>
          <p className="tiny muted">Any earlier link for this application no longer works.</p>
        </>
      ) : (
        <ActionForm action={action} onDone={(r) => { if (r.ok && r.data) setGot(r.data as Link); }}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton size="sm" variant="default" icon="chat" confirmText="Make a new link? Any link the family already has will stop working.">Create family link</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
