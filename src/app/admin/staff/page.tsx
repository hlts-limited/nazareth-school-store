import { Card, CardHeader, PageHeader, Pill } from "@/shared/ui/primitives";
import { ActionForm, CopyButton, SubmitButton } from "@/shared/ui/client";
import { env } from "@/shared/config/env";
import { Icon } from "@/shared/ui/icon";
import { ROLE_DEFS, roleName } from "@/modules/access-control";
import { requireStaff } from "@/modules/auth";
import { inviteStaffAction, listStaff, resetStaffAction, setRolesAction, setStaffStatusAction } from "@/modules/staff";
import { InviteStaff } from "../_components";

export const metadata = { title: "Staff & roles" };

const PERM_LABELS: [string, string][] = [
  ["payments.review", "Approve payments & invoices"], ["invoices.export", "Export invoices"], ["wallets.adjust", "Adjust pupil wallets"],
  ["catalogue.manage", "Manage items & categories"], ["stock.manage", "Manage stock"], ["fulfilment.manage", "Pack & hand out orders"],
  ["pupils.manage", "Add & import pupils"], ["pupils.delete", "Delete pupils"], ["pupils.empty_bin", "Empty the bin"],
  ["viewas.use", "View as parent / pupil"], ["backup.manage", "Backup & restore"], ["staff.manage", "Manage staff"], ["settings.manage", "School settings"], ["audit.view", "Audit log"],
];

export default async function StaffPage() {
  const me = await requireStaff("staff.manage");
  const staff = await listStaff();
  return (
    <>
      <PageHeader title="Staff & roles" sub="Every screen checks a permission. Changing someone's roles signs them out everywhere." actions={<InviteStaff action={inviteStaffAction} roles={ROLE_DEFS.map((r) => ({ id: r.id, name: r.name }))} />} />
      <div className="stack loose">
        <Card pad={false}>
          <div className="tbl-wrap"><table className="t rt">
            <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th>2FA</th><th /></tr></thead>
            <tbody>
              {!staff.length && <tr><td colSpan={6} className="empty">No staff yet. Use <b>Invite staff</b> to add your Registrar, Secretary and Accountant.</td></tr>}
              {staff.map((s) => {
                const roles = s.roles.map((r) => r.roleId);
                return (
                  <tr key={s.id}>
                    <td data-label="Name"><b>{s.firstName} {s.lastName}</b>{s.id === me.user.id && <span className="small muted"> (you)</span>}</td>
                    <td data-label="Email">{s.email}</td>
                    <td data-label="Roles">
                      <ActionForm action={setRolesAction} className="row tight">
                        <input type="hidden" name="userId" value={s.id} />
                        {ROLE_DEFS.map((r) => <label key={r.id} className="check small"><input type="checkbox" name="roles" value={r.id} defaultChecked={roles.includes(r.id)} /> {r.name}</label>)}
                        <SubmitButton size="sm" variant="ghost">Save</SubmitButton>
                      </ActionForm>
                    </td>
                    <td data-label="Status">{s.status === "ACTIVE" ? <Pill tone="ok">Active</Pill> : s.status === "INVITED" ? <Pill tone="info">Invited</Pill> : <Pill tone="err">Disabled</Pill>}</td>
                    <td data-label="2FA">{s.totpSecret ? <Pill tone="ok">On</Pill> : <Pill>Off</Pill>}</td>
                    <td data-label="" className="r">
                      <div className="row tight" style={{ justifyContent: "flex-end" }}>
                        {s.status === "INVITED" && s.inviteToken && s.inviteExpiresAt && s.inviteExpiresAt > new Date() && (
                          <CopyButton text={`${env().APP_URL}/invite/${s.inviteToken}`} label="Copy invite link" done={`Invite link for ${s.firstName} copied. Send it to them directly.`} />
                        )}
                        <ActionForm action={resetStaffAction}><input type="hidden" name="userId" value={s.id} /><SubmitButton size="sm" variant="default" confirmText={`Send ${s.firstName} a new set-up link? Their current password stops working.`}>Reset</SubmitButton></ActionForm>
                        {s.id !== me.user.id && (
                          <ActionForm action={setStaffStatusAction}><input type="hidden" name="userId" value={s.id} /><input type="hidden" name="status" value={s.status === "DISABLED" ? "ACTIVE" : "DISABLED"} /><SubmitButton size="sm" variant={s.status === "DISABLED" ? "default" : "danger"}>{s.status === "DISABLED" ? "Enable" : "Disable"}</SubmitButton></ActionForm>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </Card>
        <Card pad={false}>
          <CardHeader title="Permissions by role" />
          <div className="tbl-wrap"><table className="t">
            <thead><tr><th>Permission</th>{ROLE_DEFS.map((r) => <th key={r.id}>{roleName(r.id)}</th>)}</tr></thead>
            <tbody>
              {PERM_LABELS.map(([p, l]) => (
                <tr key={p}><td>{l}</td>{ROLE_DEFS.map((r) => <td key={r.id}>{(r.permissions as string[]).includes(p) ? <span style={{ color: "var(--ok)" }}><Icon name="check" size="sm" /></span> : <span className="muted">—</span>}</td>)}</tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      </div>
    </>
  );
}
