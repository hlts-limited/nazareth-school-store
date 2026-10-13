import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { ActionForm, FieldError, SubmitButton } from "@/shared/ui/client";
import { sendEnquiryAction } from "@/modules/website";
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
      <Section eyebrow="Write to us" title="Send us a message" lead="The school office reads every message and replies by email or phone, usually within one working day.">
        <div className="form-wrap">
          <ActionForm action={sendEnquiryAction} className="card stack" resetOnSuccess>
            <div className="hp" aria-hidden="true"><label htmlFor="cf-website">Leave this empty</label><input id="cf-website" name="website" tabIndex={-1} autoComplete="off" /></div>
            <div className="grid g2">
              <div className="field"><label htmlFor="cf-name">Your name</label><input className="input" id="cf-name" name="name" autoComplete="name" /><FieldError name="name" /></div>
              <div className="field"><label htmlFor="cf-subject">Subject</label><input className="input" id="cf-subject" name="subject" placeholder="e.g. Admission for Primary 3" /><FieldError name="subject" /></div>
              <div className="field"><label htmlFor="cf-email">Email</label><input className="input" id="cf-email" name="email" type="email" autoComplete="email" inputMode="email" /><FieldError name="email" /></div>
              <div className="field"><label htmlFor="cf-phone">Phone</label><input className="input" id="cf-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="0803 123 4567" /><FieldError name="phone" /></div>
            </div>
            <span className="hint">Give an email or a phone number (or both) so we can reply.</span>
            <div className="field"><label htmlFor="cf-message">Message</label><textarea className="input" id="cf-message" name="message" rows={5} /><FieldError name="message" /></div>
            <div><SubmitButton icon="mail">Send message</SubmitButton></div>
          </ActionForm>
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
