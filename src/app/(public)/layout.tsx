import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PUBLIC_NAV, SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { ThemeToggle } from "@/shared/ui/client";
import { dashboardPath, getViewer } from "@/modules/auth";
import { admissionNotice, admissionStatus } from "@/modules/admissions";
import { activeNotices } from "@/modules/website";
import { PublicNav, SignInMenu } from "./_nav";

export const metadata: Metadata = {
  title: { default: SCHOOL.name, template: `%s · ${SCHOOL.name}` },
  description: `${SCHOOL.name}, Festac Town: a nursery and primary school. ${SCHOOL.motto}.`,
};

const SOCIALS: [keyof typeof SCHOOL.social, string, string][] = [
  ["facebook", "Facebook", "facebook"],
  ["instagram", "Instagram", "instagram"],
  ["tiktok", "TikTok", "tiktok"],
  ["youtube", "YouTube", "youtube"],
  ["whatsapp", "WhatsApp", "chat"],
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [viewer, admission, notices] = await Promise.all([getViewer(), admissionStatus(), activeNotices()]);
  const nav = PUBLIC_NAV.filter((n) => n.ready);

  return (
    <div className="pub">
      <a className="skip-link" href="#content">Skip to content</a>
      {/* School notices from the back office (Website → Notices), then the admission status */}
      <div className="pub-notice" role="note">
        <Icon name="info" size="sm" />
        <ul>
          {notices.map((n) => (
            <li key={n.id}>{n.text}{n.link && <> <a href={n.link} {...(n.link.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>Find out more</a></>}</li>
          ))}
          <li>{admissionNotice(admission)}{admission.open && <> <Link href="/admissions/apply">Apply online</Link></>}</li>
        </ul>
      </div>

      <header className="pub-top">
        <div className="pub-top-in">
          <Link className="brand" href="/">
            <Image src="/logo.png" alt="" width={40} height={40} priority />
            <span><b>{SCHOOL.name}</b><small>{SCHOOL.motto}</small></span>
          </Link>
          <PublicNav items={nav} />
          <div className="pub-actions">
            <ThemeToggle />
            {viewer ? (
              <Link className="btn primary sm" href={dashboardPath(viewer)}>My account</Link>
            ) : (
              <>
                {/* Phones show the two buttons; laptops and tablets keep them behind the sign-in menu */}
                <span className="signin-btns">
                  <Link className="btn sm pub-staff" href="/staff/login"><Icon name="shield" size="sm" /><span>Staff<span className="long"> sign-in</span></span></Link>
                  <Link className="btn primary sm" href="/login"><Icon name="users" size="sm" />Sign in</Link>
                </span>
                <SignInMenu />
              </>
            )}
          </div>
        </div>
      </header>

      <main id="content" className="pub-main">{children}</main>

      <footer className="pub-foot">
        <div className="pub-foot-in">
          <div className="stack">
            <Link className="brand" href="/">
              <Image src="/logo.png" alt="" width={40} height={40} />
              <span><b>{SCHOOL.name}</b><small>{SCHOOL.motto}</small></span>
            </Link>
            <p>{SCHOOL.name} empowers minds and shapes futures through quality education, moral values, and leadership development.</p>
            <div className="row tight">
              {SOCIALS.map(([key, label, icon]) => (
                <a key={key} className="pub-social" href={SCHOOL.social[key]} target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <Icon name={icon} size="sm" />
                </a>
              ))}
            </div>
          </div>

          <div className="stack tight">
            <h2>Explore</h2>
            {nav.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
          </div>

          <div className="stack tight">
            <h2>Parents &amp; pupils</h2>
            <Link href="/login">School Store</Link>
            <Link href="/how-to-buy">How to buy (video)</Link>
            <Link href="/login?tab=pupil">Pupil sign-in</Link>
            <Link href="/staff/login">Staff sign-in</Link>
          </div>

          <div className="stack tight">
            <h2>Contact</h2>
            <span className="row tight nowrap"><Icon name="pin" size="sm" /><span>{SCHOOL.address.line1}, {SCHOOL.address.line2}, {SCHOOL.address.state}</span></span>
            <a className="row tight nowrap" href={`tel:${SCHOOL.phone.tel}`}><Icon name="phone" size="sm" /><span>{SCHOOL.phone.display}</span></a>
            <a className="row tight nowrap" href={`mailto:${SCHOOL.email}`}><Icon name="mail" size="sm" /><span>{SCHOOL.email}</span></a>
            <span className="row tight nowrap"><Icon name="clock" size="sm" /><span>{SCHOOL.officeHours}</span></span>
          </div>
        </div>
        <div className="pub-foot-base">© {new Date().getFullYear()} {SCHOOL.name}. All rights reserved.</div>
      </footer>
    </div>
  );
}
