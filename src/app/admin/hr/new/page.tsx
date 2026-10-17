import { PageHeader } from "@/shared/ui/primitives";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { registerStaffAction } from "@/modules/hr";
import { RecordFields } from "../_fields";

export const metadata = { title: "Register staff" };

const ROLE_CHOICES: [string, string, boolean][] = [
  ["head", "Head teacher (sees their section's staff and attendance)", false],
  ["hr", "Admin / HR", true],
  ["bursar", "Bursar", true],
  ["proprietor", "Proprietor", true],
];

export default async function RegisterStaffPage() {
  const v = await requireStaff("hr.manage");
  const canGiveHigh = v.permissions.has("staff.manage");
  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Register staff" sub="Creates the staff record and a one-time set-up link. Send the link to them on WhatsApp from their record; they then set a password, upload their documents and enter their bank details." />
      <ActionForm action={registerStaffAction} className="stack">
        <RecordFields salary={v.permissions.has("hr.salary")} email v={{ employmentType: "FULL_TIME" }} />
        <fieldset className="card stack">
          <legend>Access</legend>
          <p className="small muted">Everyone gets the Staff role: clock in, their documents and their payslips. Add more only if their job needs it.</p>
          <div className="stack tight">
            {ROLE_CHOICES.filter(([, , high]) => !high || canGiveHigh).map(([id, label]) => (
              <label key={id} className="check small"><input type="checkbox" name="roles" value={id} /> {label}</label>
            ))}
          </div>
          {!canGiveHigh && <p className="small muted">The HR, Bursar and Proprietor roles are given by the Super Admin.</p>}
        </fieldset>
        <div className="row"><SubmitButton icon="check">Register staff member</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
