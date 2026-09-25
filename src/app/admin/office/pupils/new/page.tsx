import { PageHeader } from "@/shared/ui/primitives";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { requireStaff } from "@/modules/auth";
import { listClasses } from "@/modules/catalogue";
import { addPupilAction, suggestRegNumber } from "@/modules/pupils";

export const metadata = { title: "Add pupil" };

export default async function NewPupilPage() {
  await requireStaff("pupils.manage");
  const [classes, reg] = await Promise.all([listClasses(), suggestRegNumber()]);
  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Add pupil" sub="The parent gets an SMS invite. If the phone number already exists, the pupil is linked to that parent automatically." />
      <ActionForm action={addPupilAction} className="card stack">
        <h3>Pupil</h3>
        <div className="grid g3">
          <div className="field"><label htmlFor="ap-sn">Surname</label><input className="input" id="ap-sn" name="lastName" /><FieldError name="lastName" /></div>
          <div className="field"><label htmlFor="ap-fn">First name</label><input className="input" id="ap-fn" name="firstName" /><FieldError name="firstName" /></div>
          <div className="field"><label htmlFor="ap-reg">Reg number</label><input className="input mono" id="ap-reg" name="regNumber" defaultValue={reg} /><FieldError name="regNumber" /></div>
          <div className="field"><label htmlFor="ap-cls">Class</label><select className="input" id="ap-cls" name="classId">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="ap-g">Gender</label><select className="input" id="ap-g" name="gender"><option>Female</option><option>Male</option></select></div>
        </div>
        <div className="divider" />
        <h3>Parent or guardian</h3>
        <div className="grid g3">
          <div className="field"><label htmlFor="ap-ph">Phone number</label><input className="input" id="ap-ph" name="parentPhone" inputMode="tel" placeholder="0803 123 4567" /><span className="hint">Used to link siblings to the same parent.</span><FieldError name="parentPhone" /></div>
          <div className="field"><label htmlFor="ap-pn">Full name</label><input className="input" id="ap-pn" name="parentName" placeholder="Only needed for a new parent" /></div>
          <div className="field"><label htmlFor="ap-pe">Email (optional)</label><input className="input" id="ap-pe" name="parentEmail" type="email" /><FieldError name="parentEmail" /></div>
        </div>
        <label className="check small"><input type="checkbox" name="consent" /> The parent has agreed that the school may store this data (Nigeria Data Protection Act 2023)</label>
        <FieldError name="consent" />
        <div className="row"><SubmitButton>Add pupil and send invite</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
