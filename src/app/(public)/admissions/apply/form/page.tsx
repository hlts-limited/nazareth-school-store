import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SCHOOL } from "@/shared/config/school";
import { naira } from "@/shared/lib/format";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { Note } from "@/shared/ui/primitives";
import { listClasses } from "@/modules/catalogue";
import { admissionStatus, submitApplicationAction } from "@/modules/admissions";
import { PageHero, Section } from "../../../_parts";
import { SCHOOLS, STAGES } from "../../../_content";

export const metadata: Metadata = { title: "Application form", robots: { index: false } };

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={`af-${id}`}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
      <FieldError name={id} />
    </div>
  );
}

const text = (id: string, opts: { type?: string; auto?: string; mode?: "tel" | "email" | "text"; placeholder?: string } = {}) => (
  <input className="input" id={`af-${id}`} name={id} type={opts.type ?? "text"} autoComplete={opts.auto ?? "off"} inputMode={opts.mode} placeholder={opts.placeholder} />
);

export default async function ApplicationFormPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const [s, classes, sp] = await Promise.all([admissionStatus(), listClasses(), searchParams]);
  if (!s.open || !s.window) redirect("/admissions/apply");
  const school = SCHOOLS.find((x) => x.href.endsWith(`/${sp.school}`)) ?? SCHOOLS[1];
  const names = STAGES.filter((st) => school.stages.includes(st.id)).flatMap((st) => st.classes);
  const options = classes.filter((c) => names.includes(c.name));

  return (
    <>
      <PageHero crumb={[["Admissions", "/admissions/process"], ["Apply online", "/admissions/apply"], [`${school.name} form`]]} title={`${school.name} application`} lead={`For the ${s.window.session} session. It takes about 10 minutes. You'll upload documents on the next page.`} />
      <Section>
        <div className="form-wrap">
          <ActionForm action={submitApplicationAction} className="stack loose">
            {s.window.formFee > 0 && <Note tone="info">After you submit this form, you&apos;ll pay the {naira(s.window.formFee)} form fee securely with Paystack. Your application is sent to the school once the payment goes through.</Note>}
            <div className="hp" aria-hidden="true"><label htmlFor="af-website">Leave this empty</label><input id="af-website" name="website" tabIndex={-1} autoComplete="off" /></div>

            <fieldset className="card stack">
              <legend><span className="step-n" aria-hidden="true">1</span>The child</legend>
              <div className="grid g2">
                <Field id="surname" label="Surname">{text("surname")}</Field>
                <Field id="otherNames" label="Other names">{text("otherNames")}</Field>
                <Field id="dateOfBirth" label="Date of birth">{text("dateOfBirth", { type: "date" })}</Field>
                <Field id="gender" label="Gender">
                  <select className="input" id="af-gender" name="gender" defaultValue=""><option value="">Choose…</option><option>Female</option><option>Male</option></select>
                </Field>
                <Field id="classId" label="Class applying for">
                  <select className="input" id="af-classId" name="classId" defaultValue=""><option value="">Choose…</option>{options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </Field>
                <Field id="previousSchool" label="Current or last school (if any)">{text("previousSchool")}</Field>
                <Field id="currentClass" label="Current class (if any)">{text("currentClass")}</Field>
                <Field id="nationality" label="Nationality">{text("nationality", { placeholder: "Nigerian" })}</Field>
                <Field id="stateOfOrigin" label="State of origin">{text("stateOfOrigin")}</Field>
                <Field id="religion" label="Religion">{text("religion")}</Field>
                <Field id="languages" label="Languages spoken">{text("languages", { placeholder: "e.g. English, Yoruba" })}</Field>
              </div>
            </fieldset>

            <fieldset className="card stack">
              <legend><span className="step-n" aria-hidden="true">2</span>Parent or guardian</legend>
              <div className="grid g2">
                <Field id="parentName" label="Full name">{text("parentName", { auto: "name" })}</Field>
                <Field id="relationship" label="Relationship to the child">
                  <select className="input" id="af-relationship" name="relationship" defaultValue=""><option value="">Choose…</option><option>Mother</option><option>Father</option><option>Guardian</option></select>
                </Field>
                <Field id="parentPhone" label="Phone number" hint="We use this to contact you, and to link brothers and sisters.">{text("parentPhone", { type: "tel", auto: "tel", mode: "tel", placeholder: "0803 123 4567" })}</Field>
                <Field id="parentEmail" label="Email (optional)" hint="For your Paystack receipt and School Store invite.">{text("parentEmail", { type: "email", auto: "email", mode: "email" })}</Field>
                <Field id="occupation" label="Occupation">{text("occupation")}</Field>
                <Field id="otherParentName" label="Other parent's name (optional)">{text("otherParentName")}</Field>
                <Field id="otherParentPhone" label="Other parent's phone (optional)">{text("otherParentPhone", { type: "tel", mode: "tel" })}</Field>
              </div>
              <Field id="address" label="Home address">
                <textarea className="input" id="af-address" name="address" rows={2} autoComplete="street-address" />
              </Field>
            </fieldset>

            <fieldset className="card stack">
              <legend><span className="step-n" aria-hidden="true">3</span>Health and declaration</legend>
              <Field id="health" label="Health, sight, speech or learning needs (optional)" hint="Anything the school should know to care for your child, e.g. allergies or support needed.">
                <textarea className="input" id="af-health" name="health" rows={3} />
              </Field>
              <label className="check">
                <input type="checkbox" name="declaration" />
                <span>I confirm the information above is true. If my child is ill or injured at school, I agree they may receive treatment at the nearest approved medical centre at my expense. I agree that {SCHOOL.name} may store this information to process the application (Nigeria Data Protection Act 2023).</span>
              </label>
              <FieldError name="declaration" />
            </fieldset>

            <div className="row">
              <SubmitButton size="lg">{s.window.formFee > 0 ? `Continue to payment (${naira(s.window.formFee)})` : "Submit application"}</SubmitButton>
              <Link className="btn lg" href="/admissions/apply">Cancel</Link>
            </div>
          </ActionForm>
        </div>
      </Section>
    </>
  );
}
