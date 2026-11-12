import { Card, CardHeader, PageHeader, Pill } from "@/shared/ui/primitives";
import { ActionForm, CopyButton, SubmitButton } from "@/shared/ui/client";
import { env } from "@/shared/config/env";
import { Icon } from "@/shared/ui/icon";
import { DataTable } from "@/shared/ui/data-table";
import { keyed } from "@/shared/ui/table-cells";
import { ROLE_DEFS, roleName } from "@/modules/access-control";
import { requireStaff } from "@/modules/auth";
import { deleteStaffAction, inviteStaffAction, listStaff, resetStaffAction, setRolesAction, setStaffStatusAction } from "@/modules/staff";
import { AlphaDelete } from "@/shared/ui/alpha-delete";
import { InviteStaff, RolesForm } from "./_widgets";

export const metadata = { title: "Staff & roles" };

const PERM_LABELS: [string, string][] = [
  ["payments.review", "Approve payments & invoices"], ["invoices.export", "Export invoices"], ["wallets.adjust", "Adjust parent wallets"],
  ["catalogue.manage", "Manage items & categories"], ["stock.manage", "Manage stock"], ["fulfilment.manage", "Pack & hand out orders"],
  ["pupils.manage", "Add & import pupils"], ["pupils.delete", "Delete pupils (Alpha only)"], ["pupils.empty_bin", "Empty the bin (Alpha only)"], ["staff.delete", "Delete staff (Alpha only)"], ["catalogue.delete", "Delete items (Alpha only)"],
  ["viewas.use", "View as parent / pupil"], ["backup.manage", "Backup & restore"], ["staff.manage", "Manage staff"], ["settings.manage", "School settings"], ["audit.view", "Audit log (Alpha only)"],
  ["admissions.view", "See applications"], ["admissions.manage", "Handle applications & enrol"], ["admissions.publish", "Open admission & publish results"], ["website.manage", "Website notices, events, gallery & messages"],
  ["self.service", "Own staff page (profile, documents, clock-in, payslips)"], ["hr.view.section", "See own section's staff"], ["hr.view", "See all staff records"],
  ["hr.manage", "Register staff & review documents"], ["hr.salary", "See and set salaries"], ["hr.bank.approve", "Verify staff bank details"],
  ["attendance.view.section", "See attendance (own section)"], ["attendance.manage", "Manage attendance, leave & holidays"], ["attendance.photos", "See clock-in photos"],
  ["payroll.view", "See payroll"], ["payroll.run", "Prepare payroll (3 stages)"], ["payroll.penalties", "Enter penalties & waivers"], ["payroll.approve", "Approve payroll"], ["payroll.pay", "Pay salaries"],
];

export default async function StaffPage() {
  const me = await requireStaff("staff.manage");
  const staff = await listStaff();
  return (
    <>
      <PageHeader title="Staff & roles" sub="Every screen checks a permission. Changing someone's roles signs them out everywhere." actions={<InviteStaff action={inviteStaffAction} roles={ROLE_DEFS.map((r) => ({ id: r.id, name: r.name }))} />} />
      <div className="stack loose">
        <Card pad={false}>
          <DataTable
            filter="Filter by name, email or role"
            empty="No staff yet"
            emptyText={<>Use <b>Invite staff</b> to add your Registrar, Secretary and Accounts staff.</>}
            columns={[{ label: "Name", sortable: true }, { label: "Email", sortable: true }, { label: "Roles" }, { label: "Status", sortable: true }, { label: "2FA", sortable: true }, { label: "", right: true }]}
            initialSort={{ col: 0, dir: "asc" }}
            rows={staff.map((s) => {
              const roles = s.roles.map((r) => r.roleId);
              const status = s.status === "ACTIVE" ? "Active" : s.status === "INVITED" ? "Invited" : "Disabled";
              return {
                id: s.id,
                search: `${s.firstName} ${s.lastName} ${s.email} ${roles.map(roleName).join(" ")}`,
                sort: [`${s.lastName} ${s.firstName}`, s.email, null, status, s.totpSecret ? 1 : 0, null],
                cells: keyed([
                  <><b>{s.firstName} {s.lastName}</b>{s.id === me.user.id && <span className="small muted"> (you)</span>}</>,
                  s.email,
                  <RolesForm key="roles" action={setRolesAction} userId={s.id} roles={ROLE_DEFS.map((r) => ({ id: r.id, name: r.name }))} current={roles} />,
                  <Pill key="st" tone={s.status === "ACTIVE" ? "ok" : s.status === "INVITED" ? "info" : "err"}>{status}</Pill>,
                  s.totpSecret ? <Pill tone="ok">On</Pill> : <Pill>Off</Pill>,
                  <div key="act" className="row tight justify-end">
                    {s.status === "INVITED" && s.inviteToken && s.inviteExpiresAt && s.inviteExpiresAt > new Date() && (
                      <CopyButton text={`${env().APP_URL}/invite/${s.inviteToken}`} label="Copy invite link" done={`Invite link for ${s.firstName} copied. Send it to them directly.`} />
                    )}
                    <ActionForm action={resetStaffAction}><input type="hidden" name="userId" value={s.id} /><SubmitButton size="sm" variant="default" confirmText={`Send ${s.firstName} a new set-up link? Their current password stops working.`}>Reset</SubmitButton></ActionForm>
                    {s.id !== me.user.id && me.permissions.has("staff.delete") && <AlphaDelete action={deleteStaffAction} field="userId" id={s.id} what={`${s.firstName} ${s.lastName}`} />}
                    {s.id !== me.user.id && (
                      <ActionForm action={setStaffStatusAction}><input type="hidden" name="userId" value={s.id} /><input type="hidden" name="status" value={s.status === "DISABLED" ? "ACTIVE" : "DISABLED"} /><SubmitButton size="sm" variant={s.status === "DISABLED" ? "default" : "danger"}>{s.status === "DISABLED" ? "Enable" : "Disable"}</SubmitButton></ActionForm>
                    )}
                  </div>,
                ]),
              };
            })}
          />
        </Card>
        <Card pad={false}>
          <CardHeader title="Permissions by role" />
          <div className="tbl-wrap"><table className="t">
            <thead><tr><th>Permission</th>{ROLE_DEFS.map((r) => <th key={r.id}>{roleName(r.id)}</th>)}</tr></thead>
            <tbody>
              {PERM_LABELS.map(([p, l]) => (
                <tr key={p}><td>{l}</td>{ROLE_DEFS.map((r) => <td key={r.id}>{(r.permissions as string[]).includes(p) ? <span className="c-ok"><Icon name="check" size="sm" /></span> : <span className="muted">—</span>}</td>)}</tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      </div>
    </>
  );
}
