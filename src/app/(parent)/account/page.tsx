import { Avatar, Card, Note, PageHeader } from "@/shared/ui/primitives";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { displayName, endViewAs, logout, requireParentActor } from "@/modules/auth";
import { childrenOf, setPupilPinAction } from "@/modules/pupils";
import { getSettings } from "@/modules/settings";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const { parent, readOnly } = await requireParentActor();
  const [kids, settings] = await Promise.all([childrenOf(parent.id), getSettings()]);
  const lim = settings.sessionLimits.PARENT;
  return (
    <>
      <PageHeader title="Account" />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <Card className="stack">
          <div className="row"><Avatar id={parent.id} first={parent.firstName} last={parent.lastName} size="lg" dark /><div><b>{displayName(parent)}</b><div className="small muted">{parent.phone} · {parent.email ?? "no email"}</div></div></div>
          <Note icon="shield">You can be signed in on up to {lim.devices} devices. Without &ldquo;Remember this device&rdquo;, you&apos;re signed out after {lim.idleMinutes} minutes of inactivity.</Note>
          <p className="small muted">To change your phone number or email, contact the school office. To get a copy of your family&apos;s data, or ask for it to be corrected or deleted, contact the office too (Nigeria Data Protection Act 2023).</p>
          {readOnly
            ? <form action={endViewAs}><button className="btn" type="submit">Exit view-as</button></form>
            : <form action={logout}><button className="btn danger" type="submit">Sign out</button></form>}
        </Card>
        <Card className="stack">
          <h3>Pupil dashboard PIN</h3>
          <p className="small muted">Children sign in with their surname and reg number. Add a 4–6 digit PIN for extra protection; leave it blank and save to remove it.</p>
          {kids.map((k) => (
            <ActionForm key={k.id} action={setPupilPinAction} className="row" resetOnSuccess>
              <input type="hidden" name="pupilId" value={k.id} />
              <span className="grow"><b>{k.firstName}</b> <span className="small muted">{k.pinHash ? "PIN set" : "No PIN"}</span></span>
              <input className="input sm mono" name="pin" type="password" inputMode="numeric" maxLength={6} placeholder="New PIN" aria-label={`PIN for ${k.firstName}`} style={{ width: 120 }} />
              <SubmitButton size="sm" variant="default" disabled={readOnly}>Save</SubmitButton>
              <FieldError name="pin" />
            </ActionForm>
          ))}
        </Card>
      </div>
    </>
  );
}
