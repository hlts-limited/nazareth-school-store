import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Empty } from "@/shared/ui/primitives";
import { pastEvents, upcomingEvents } from "@/modules/website";
import { AdmissionCta, PageHero, Section, SectionLinks } from "../_parts";
import { EventCard } from "../_events";

export const metadata: Metadata = { title: "Events", description: `Upcoming events and school calendar at ${SCHOOL.name}.` };

export default async function EventsPage() {
  const [upcoming, past] = await Promise.all([upcomingEvents(), pastEvents()]);
  return (
    <>
      <PageHero crumb={[["School life"], ["Events"]]} title="Events" lead="Sports, cultural days, open days and other dates for parents and pupils." />
      <Section eyebrow="Coming up" title="Upcoming events">
        {upcoming.length
          ? <div className="grid g2">{upcoming.map((e) => <EventCard key={e.id} e={e} />)}</div>
          : <div className="card"><Empty title="No upcoming events yet">New dates are posted here and on our social media pages.</Empty></div>}
      </Section>
      {past.length > 0 && (
        <Section eyebrow="Looking back" title="Recent events">
          <div className="grid g2">{past.map((e) => <EventCard key={e.id} e={e} past />)}</div>
        </Section>
      )}
      <SectionLinks group="School life" current="/events" />
      <AdmissionCta />
    </>
  );
}
