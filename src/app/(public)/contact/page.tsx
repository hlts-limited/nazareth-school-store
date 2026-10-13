import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { MapEmbed, PageHero, Section } from "../_parts";

export const metadata: Metadata = { title: "Contact", description: `Phone, email, office hours and directions for ${SCHOOL.name}, Festac Town.` };

export default function ContactPage() {
  const address = `${SCHOOL.address.line1}, ${SCHOOL.address.line2}, ${SCHOOL.address.state}, Nigeria`;
  const channels: [string, string, string, string, boolean][] = [
    ["phone", "Call the office", SCHOOL.phone.display, `tel:${SCHOOL.phone.tel}`, false],
    ["chat", "WhatsApp", "Message us on WhatsApp", SCHOOL.social.whatsapp, true],
    ["mail", "Email", SCHOOL.email, `mailto:${SCHOOL.email}`, false],
  ];

  return (
    <>
      <PageHero crumb={[["Contact"]]} title={`Contact ${SCHOOL.name}`} lead="We are here to help parents, pupils, and visitors with admissions, enquiries, and directions." />
      <Section>
        <div className="grid g3">
          {channels.map(([icon, label, value, href, external]) => (
            <a key={label} className="card contact-card" href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              <span className="reason-ic"><Icon name={icon} /></span>
              <span className="stack tight">
                <span className="eyebrow">{label}</span>
                <b>{value}</b>
              </span>
            </a>
          ))}
        </div>
      </Section>
      <Section eyebrow="Find us" title="Visit the school">
        <div className="process">
          <MapEmbed />
          <aside className="card stack">
            <div className="stack tight">
              <span className="eyebrow">Address</span>
              <p><b>{SCHOOL.name}</b><br />{SCHOOL.address.line1},<br />{SCHOOL.address.line2},<br />{SCHOOL.address.state}, Nigeria</p>
            </div>
            <div className="stack tight">
              <span className="eyebrow">Office hours</span>
              <p>{SCHOOL.officeHours}<br /><span className="muted">Closed at weekends and on public holidays</span></p>
            </div>
            <a className="btn primary block" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer">
              <Icon name="pin" size="sm" />Get directions
            </a>
          </aside>
        </div>
      </Section>
    </>
  );
}
