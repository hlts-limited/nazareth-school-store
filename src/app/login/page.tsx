import Image from "next/image";
import { redirect } from "next/navigation";
import { SCHOOL } from "@/shared/config/school";
import { requestMeta } from "@/shared/lib/request";
import { Icon } from "@/shared/ui/icon";
import { Note } from "@/shared/ui/primitives";
import { CAPTCHA_AFTER, endedSessionReason, getViewer, loginParent, loginPupil, loginStaff, makeCaptcha, recentFailures } from "@/modules/auth";
import { LoginForms } from "./login-forms";
import { LoginScene } from "./login-scene";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const v = await getViewer();
  if (v) redirect("/");
  const { tab } = await searchParams;
  const { ip } = await requestMeta();
  const needCaptcha = (await recentFailures(`pupil-ip:${ip}`)) >= CAPTCHA_AFTER;
  const captcha = needCaptcha ? makeCaptcha() : null;
  const ended = await endedSessionReason();
  return (
    <div className="login">
      <section className="login-art">
        <LoginScene />
        <div className="row nowrap rise" style={{ gap: 14, position: "relative", zIndex: 1 }}>
          <Image src="/logo.png" alt="Nazareth School crest" width={64} height={64} style={{ background: "#fff", borderRadius: 14, padding: 5 }} priority />
          <div>
            <div className="motto">{SCHOOL.motto}</div>
            <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, marginTop: 3 }}>{SCHOOL.name}</div>
          </div>
        </div>
        <div className="stack" style={{ position: "relative", zIndex: 1 }}>
          <h1><span className="rise d1">Books and uniforms</span> <span className="rise d2">for every child,</span> <span className="rise d3">in one checkout.</span></h1>
          <p className="rise d4">Shop your children&apos;s booklists, pay by card or bank transfer, and know exactly when to come for pick-up.</p>
        </div>
        <div className="feat">
          <div className="rise d5"><Icon name="users" /> All your children on one dashboard</div>
          <div className="rise d6"><Icon name="card" /> Paystack or direct bank transfer</div>
          <div className="rise d7"><Icon name="box" /> Track every order to pick-up</div>
        </div>
      </section>
      <section className="login-form">
        <div className="login-box">
          <div className="stack tight"><h2>Sign in</h2><p className="muted">Choose who is signing in.</p></div>
          {ended && (
            <Note tone="warn" icon="shield">
              {ended === "Signed in on another device"
                ? "You were signed out because this account signed in on another device. Only one device can be signed in at a time."
                : `You were signed out: ${ended.toLowerCase()}.`}
            </Note>
          )}
          <LoginForms
            initialTab={tab === "pupil" || tab === "staff" ? tab : "parent"}
            captcha={captcha}
            actions={{ parent: loginParent, pupil: loginPupil, staff: loginStaff }}
          />
        </div>
      </section>
    </div>
  );
}
