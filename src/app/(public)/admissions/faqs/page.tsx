import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { PageHero, Section, SectionLinks } from "../../_parts";

export const metadata: Metadata = { title: "Admission FAQs", description: `Answers to the questions parents ask most before admission to ${SCHOOL.name}.` };

const call = <a href={`tel:${SCHOOL.phone.tel}`}>{SCHOOL.phone.display}</a>;

const FAQS: [string, ReactNode][] = [
  ["What age should my child be before admission?", <>Age requirements differ for each class, from Kindergarten to Primary 6. Please call the school office on {call} for the requirement for your child&apos;s class.</>],
  ["How can I get an application form?", <>When admission is open, start on the <Link href="/admissions/apply">Apply online</Link> page, or collect a form from the school office at {SCHOOL.address.line1}, {SCHOOL.address.line2}.</>],
  ["Does the school hold entrance examinations?", <>Yes. Entrance assessment dates and results are published on the <Link href="/admissions/results">Admission results</Link> page.</>],
  ["What documents are required?", "The application form lists every document you need, such as a passport photograph, birth certificate, and your child's most recent school result."],
  ["What curriculum does the school offer?", <>A full programme from Kindergarten to Primary 6: Pre-School, Lower Primary (Prep 1 – Primary 2) and Upper Primary (Primary 3 – 6), with Upper Primary pupils prepared for the FSLC examination. See <Link href="/academics/curriculum">our curriculum</Link>.</>],
  ["Are there co-curricular activities?", <>Yes. From inter-house sports to cultural festivals, our events build character, teamwork, and lasting memories. See <Link href="/academics/co-curricular">co-curricular activities</Link>.</>],
  ["Do you provide transport?", <>Please contact the school office on {call} for information about transport.</>],
  ["How are school fees paid?", "Successful candidates are told how to pay school fees with their admission result. Please contact the school office for fee amounts."],
  ["Do you admit transfer pupils?", <>Please contact the school office on {call} to ask about space in the class your child would join.</>],
  ["Can we visit the school before applying?", <>Yes. You are welcome during office hours ({SCHOOL.officeHours}). Please call {call} before you come.</>],
];

export default function FaqsPage() {
  return (
    <>
      <PageHero crumb={[["Admissions"], ["FAQs"]]} title="Admission FAQs" lead="Answers to the questions parents ask most before admission." />
      <Section>
        <div className="process">
          <div className="faq">
            {FAQS.map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>{q}<Icon name="plus" size="sm" /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <aside className="card stack">
            <h3>Still have questions?</h3>
            <p className="muted">Contact the school office directly. We are happy to help.</p>
            <a className="btn block" href={`tel:${SCHOOL.phone.tel}`}><Icon name="phone" size="sm" />{SCHOOL.phone.display}</a>
            <Link className="btn primary block" href="/contact">Contact us</Link>
          </aside>
        </div>
      </Section>
      <SectionLinks group="Admissions" current="/admissions/faqs" />
    </>
  );
}
