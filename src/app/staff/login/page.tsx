import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPath, endedSessionReason, getViewer, loginStaff } from "@/modules/auth";
import { StaffLoginForm } from "../../login/login-forms";
import { LoginShell } from "../../login/login-shell";

export const metadata = { title: "Staff sign-in" };

/** The staff side: one sign-in for the back office, whatever each person's role. */
export default async function StaffLoginPage() {
  const v = await getViewer();
  if (v) redirect(dashboardPath(v));
  return (
    <LoginShell
      heading="Staff sign-in"
      lines={["The whole school,", "run from", "one place."]}
      text="Admissions, the School Store, attendance and payroll for Nazareth School staff. You see only what your role needs."
      feats={[["clock", "Clock in and out at the gate"], ["receipt", "Your payslips, leave and staff record"], ["layers", "Admissions, store and school records"]]}
      sub="Use your school email address."
      ended={await endedSessionReason()}
      footer={<>Parent or pupil? <Link href="/login">Sign in here</Link></>}
    >
      <StaffLoginForm action={loginStaff} />
    </LoginShell>
  );
}
