import Image from "next/image";
import QRCode from "qrcode";
import { db } from "@/shared/lib/db";
import { SCHOOL } from "@/shared/config/school";
import { acceptInvite, totpUri } from "@/modules/auth";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Note } from "@/shared/ui/primitives";

export const metadata = { title: "Set your password" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await db.user.findUnique({ where: { inviteToken: token } });
  const valid = user && user.inviteExpiresAt && user.inviteExpiresAt > new Date();
  const qr = valid && user.type === "STAFF" && user.totpSecret && user.email ? await QRCode.toDataURL(totpUri(user.email, user.totpSecret), { margin: 1, width: 180 }) : null;

  return (
    <main className="main" style={{ maxWidth: 520 }}>
      <div className="stack loose">
        <div className="brand">
          <Image src="/logo.png" alt="" width={40} height={40} />
          <span><b>{SCHOOL.storeName}</b><small>{SCHOOL.motto}</small></span>
        </div>
        {!valid ? (
          <div className="card empty"><h3>This link has expired</h3><p>Ask the school office to send you a new invite.</p></div>
        ) : (
          <ActionForm action={acceptInvite} className="card stack">
            <h1>Welcome, {user.firstName}</h1>
            <p className="muted">Set a password to {user.type === "PARENT" ? "shop for your children and track orders" : "use the store back office"}.</p>
            <input type="hidden" name="token" value={token} />
            <div className="field"><label htmlFor="iv-pw">New password</label><input className="input" id="iv-pw" name="password" type="password" autoComplete="new-password" required /><span className="hint">At least 8 characters, with a letter and a number.</span><FieldError name="password" /></div>
            <div className="field"><label htmlFor="iv-cf">Confirm password</label><input className="input" id="iv-cf" name="confirm" type="password" autoComplete="new-password" required /><FieldError name="confirm" /></div>
            {qr && (
              <div className="stack tight">
                <Note icon="shield">Your role needs two-factor sign-in. Scan this code with Google Authenticator or Microsoft Authenticator, then enter the 6-digit code it shows.</Note>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Authenticator QR code" width={180} height={180} style={{ background: "#fff", padding: 6, borderRadius: 8 }} />
                <div className="field"><label htmlFor="iv-code">6-digit code</label><input className="input mono" id="iv-code" name="code" inputMode="numeric" maxLength={6} style={{ maxWidth: 160 }} /><FieldError name="code" /></div>
              </div>
            )}
            {user.type === "PARENT" && (
              <label className="check small"><input type="checkbox" name="consent" /> I agree that {SCHOOL.name} may store my family&apos;s details to run the store, as described in the privacy notice (Nigeria Data Protection Act 2023).</label>
            )}
            <FieldError name="consent" />
            <SubmitButton size="lg" block>Save password</SubmitButton>
          </ActionForm>
        )}
      </div>
    </main>
  );
}
