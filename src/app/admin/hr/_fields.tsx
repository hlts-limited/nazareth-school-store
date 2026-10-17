import { FieldError } from "@/shared/ui/client";
import { POSITIONS, STAFF_SECTIONS_LIST } from "@/modules/hr";

type Values = {
  firstName?: string; lastName?: string; email?: string | null; phone?: string | null; gender?: string | null; dateOfBirth?: string;
  section?: string; position?: string; isTeacher?: boolean; hireDate?: string; employmentType?: string; monthlyGross?: number;
  tin?: string | null; pfaName?: string | null; rsaPin?: string | null; nhfNumber?: string | null; nhisNumber?: string | null; annualRent?: number;
};

const F = ({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) => (
  <div className="field"><label htmlFor={`sr-${id}`}>{label}</label>{children}{hint && <span className="hint">{hint}</span>}<FieldError name={id} /></div>
);

/** The staff record's fields, for registering and for editing. `salary` shows the salary box; `email` the email box. */
export function RecordFields({ v = {}, salary, email }: { v?: Values; salary: boolean; email: boolean }) {
  return (
    <>
      <fieldset className="card stack">
        <legend>Person</legend>
        <div className="grid g3">
          <F id="lastName" label="Surname"><input className="input" id="sr-lastName" name="lastName" defaultValue={v.lastName} /></F>
          <F id="firstName" label="First name"><input className="input" id="sr-firstName" name="firstName" defaultValue={v.firstName} /></F>
          {email && <F id="email" label="Email" hint="For signing in."><input className="input" id="sr-email" name="email" type="email" defaultValue={v.email ?? ""} /></F>}
          <F id="phone" label="Phone (WhatsApp)" hint="Invite and payslip links are sent here."><input className="input" id="sr-phone" name="phone" inputMode="tel" placeholder="0803 123 4567" defaultValue={v.phone ?? ""} /></F>
          <F id="gender" label="Gender">
            <select className="input" id="sr-gender" name="gender" defaultValue={v.gender ?? ""}><option value="">—</option><option>Female</option><option>Male</option></select>
          </F>
          <F id="dateOfBirth" label="Date of birth"><input className="input" id="sr-dateOfBirth" name="dateOfBirth" type="date" defaultValue={v.dateOfBirth} /></F>
        </div>
      </fieldset>

      <fieldset className="card stack">
        <legend>Job</legend>
        <div className="grid g3">
          <F id="section" label="Section">
            <select className="input" id="sr-section" name="section" defaultValue={v.section ?? ""}>
              <option value="" disabled>Choose…</option>
              {STAFF_SECTIONS_LIST.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </F>
          <F id="position" label="Position">
            <input className="input" id="sr-position" name="position" list="sr-positions" defaultValue={v.position} placeholder="e.g. Class Teacher" />
            <datalist id="sr-positions">{POSITIONS.map((p) => <option key={p} value={p} />)}</datalist>
          </F>
          <F id="hireDate" label="Hire date"><input className="input" id="sr-hireDate" name="hireDate" type="date" defaultValue={v.hireDate} /></F>
          <F id="employmentType" label="Employment">
            <select className="input" id="sr-employmentType" name="employmentType" defaultValue={v.employmentType ?? "FULL_TIME"}><option value="FULL_TIME">Full-time</option><option value="PART_TIME">Part-time</option></select>
          </F>
          {salary && <F id="monthlyGross" label="Monthly gross salary (₦)"><input className="input" id="sr-monthlyGross" name="monthlyGross" inputMode="decimal" defaultValue={v.monthlyGross ?? ""} placeholder="100,000" /></F>}
        </div>
        <label className="check small"><input type="checkbox" name="isTeacher" defaultChecked={v.isTeacher} /> Teaching staff (a TRCN licence is then required)</label>
      </fieldset>

      <fieldset className="card stack">
        <legend>Tax and remittance</legend>
        <div className="grid g3">
          <F id="tin" label="Tax ID (TIN)"><input className="input mono" id="sr-tin" name="tin" defaultValue={v.tin ?? ""} /></F>
          <F id="pfaName" label="Pension fund administrator (PFA)"><input className="input" id="sr-pfaName" name="pfaName" defaultValue={v.pfaName ?? ""} /></F>
          <F id="rsaPin" label="RSA PIN"><input className="input mono" id="sr-rsaPin" name="rsaPin" defaultValue={v.rsaPin ?? ""} /></F>
          <F id="nhfNumber" label="NHF number"><input className="input mono" id="sr-nhfNumber" name="nhfNumber" defaultValue={v.nhfNumber ?? ""} /></F>
          <F id="nhisNumber" label="NHIS / NHIA number"><input className="input mono" id="sr-nhisNumber" name="nhisNumber" defaultValue={v.nhisNumber ?? ""} /></F>
          <F id="annualRent" label="Annual rent paid (₦)" hint="For rent relief on tax. Leave empty if none."><input className="input" id="sr-annualRent" name="annualRent" inputMode="decimal" defaultValue={v.annualRent || ""} /></F>
        </div>
      </fieldset>
    </>
  );
}
