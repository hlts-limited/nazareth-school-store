import { Card, PageHeader, Pill } from "@/shared/ui/primitives";
import { roleName } from "@/modules/access-control";
import { changePasswordAction, ChangePasswordForm, getViewAs, requireStaff } from "@/modules/auth";

export const metadata = { title: "My account" };

export default async function StaffAccountPage() {
  const v = await requireStaff();
  const viewingAs = !!(await getViewAs());
  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader title="My account" sub="Your sign-in details for the back office." />
      <div className="stack loose">
        <Card className="stack tight">
          <div className="row between"><b>{v.user.firstName} {v.user.lastName}</b><span className="row tight">{v.roles.map((r) => <Pill key={r} dot={false}>{roleName(r)}</Pill>)}</span></div>
          <div className="small muted">{v.user.email}</div>
          <div className="small">Two-factor sign-in: {v.user.totpSecret ? <Pill tone="ok">On</Pill> : <Pill>Off</Pill>}</div>
        </Card>
        <Card className="stack">
          <h3>Change password</h3>
          <ChangePasswordForm action={changePasswordAction} needCode={!!v.user.totpSecret} minLength={10} disabled={viewingAs} />
        </Card>
      </div>
    </div>
  );
}
