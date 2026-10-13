import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { AdmissionCta, PageHero, Section, SectionLinks, Split } from "../../_parts";

export const metadata: Metadata = { title: "Welcome address", description: `A welcome message from ${SCHOOL.supervisor}, Supervisor of ${SCHOOL.name}.` };

export default function WelcomePage() {
  return (
    <>
      <PageHero crumb={[["About"], ["Welcome address"]]} title="A welcome from our Supervisor" lead={`Welcome to ${SCHOOL.name}, where faith, discipline and academic excellence come together to nurture every child.`} />
      <Section>
        <Split img="/images/irene.jpg" alt={`${SCHOOL.supervisor}, Supervisor of ${SCHOOL.name}`}>
          <p><b>Dear Parents, Pupils and Visitors,</b></p>
          <p>It is with great joy and gratitude that I welcome you to {SCHOOL.name}. Our school is built on a strong foundation of faith, discipline, and academic excellence. We are committed to nurturing every child entrusted to our care — developing not only their intellect but also their character and moral values.</p>
          <p>At {SCHOOL.name}, we believe that every child is gifted and capable of greatness. Our dedicated team of educators work tirelessly to create a supportive and inspiring environment where pupils can thrive and reach their full potential.</p>
          <p>God bless you all.</p>
          <p className="welcome-sig"><b>{SCHOOL.supervisor}</b><span className="muted"> · Supervisor, {SCHOOL.name}</span></p>
        </Split>
      </Section>
      <SectionLinks group="About" current="/about/welcome" />
      <AdmissionCta />
    </>
  );
}
