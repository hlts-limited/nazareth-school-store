import Link from "next/link";
import { redirect } from "next/navigation";
import { requestMeta } from "@/shared/lib/request";
import { CAPTCHA_AFTER, dashboardPath, endedSessionReason, getViewer, loginParent, loginPupil, makeCaptcha, recentFailures } from "@/modules/auth";
import { LoginForms } from "./login-forms";
import { LoginShell } from "./login-shell";

export const metadata = { title: "Sign in" };

/** Parents and pupils sign in here; staff have their own page at /staff/login. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ tab?: string; next?: string }> }) {
  const { tab, next } = await searchParams;
  if (tab === "staff" || next === "admin") redirect("/staff/login"); // older links and bookmarks
  const v = await getViewer();
  if (v) redirect(dashboardPath(v));
  const { ip } = await requestMeta();
  const needCaptcha = (await recentFailures(`pupil-ip:${ip}`)) >= CAPTCHA_AFTER;
  const captcha = needCaptcha ? makeCaptcha() : null;
  return (
    <LoginShell
      lines={["Books and uniforms", "for every child,", "in one checkout."]}
      text="Shop your children's booklists, pay by card or bank transfer, and know exactly when to come for pick-up."
      feats={[["users", "All your children on one dashboard"], ["card", "Paystack or direct bank transfer"], ["box", "Track every order to pick-up"]]}
      sub="Choose who is signing in."
      ended={await endedSessionReason()}
      footer={<>School staff? <Link href="/staff/login">Staff sign-in</Link></>}
    >
      <LoginForms initialTab={tab === "pupil" ? "pupil" : "parent"} captcha={captcha} actions={{ parent: loginParent, pupil: loginPupil }} />
    </LoginShell>
  );
}
