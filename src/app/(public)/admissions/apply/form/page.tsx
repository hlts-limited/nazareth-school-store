import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { naira } from "@/shared/lib/format";
import { ADMISSION_CLASSES, AGE_DAY, MAX_AGE, MIN_AGE, ageDay } from "@/shared/lib/admission-age";
import { Note } from "@/shared/ui/primitives";
import { admissionStatus, ApplicationFields, submitApplicationAction } from "@/modules/admissions";
import { PageHero, Section } from "../../../_parts";
import { SCHOOLS } from "../../../_content";

export const metadata: Metadata = { title: "Application form", robots: { index: false } };

export default async function ApplicationFormPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const [s, sp] = await Promise.all([admissionStatus(), searchParams]);
  if (!s.open || !s.window) redirect("/admissions/apply");
  const school = SCHOOLS.find((x) => x.href.endsWith(`/${sp.school}`)) ?? SCHOOLS[1];
  const fee = s.window.formFee;

  return (
    <>
      <PageHero crumb={[["Admissions", "/admissions/process"], ["Apply online", "/admissions/apply"], [`${school.name} form`]]} title={`${school.name} application`}
        lead={`For the ${s.window.session} session. It takes about 10 minutes. Have the child's passport photo, baptismal or dedication certificate, and birth certificate ready.`} />
      <Section>
        <div className="form-wrap stack loose">
          <Note tone="info">The class is chosen by the child&apos;s age on {AGE_DAY} {ageDay(s.window.session).slice(0, 4)}, the start of the {s.window.session} session: age {MIN_AGE} {ADMISSION_CLASSES[0]}, {MIN_AGE + 1} {ADMISSION_CLASSES[1]}, {MIN_AGE + 2} {ADMISSION_CLASSES[2]}, and so on up to age {MAX_AGE} {ADMISSION_CLASSES[ADMISSION_CLASSES.length - 1]}. We don&apos;t admit new pupils into Primary 6.</Note>
          {fee > 0 && <Note tone="info">After you submit this form, you&apos;ll pay the {naira(fee)} form fee securely with Paystack. Your application is sent to the school once the payment goes through.</Note>}
          <ApplicationFields action={submitApplicationAction} mode="public" windows={[{ id: s.window.id, session: s.window.session, formFee: fee }]}
            submitLabel={fee > 0 ? `Continue to payment (${naira(fee)})` : "Submit application"} cancelHref="/admissions/apply" />
        </div>
      </Section>
    </>
  );
}
