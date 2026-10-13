import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ADMISSION, PUBLIC_NAV, SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";

/** Banner at the top of every inner page: breadcrumb, title and a one-line lead */
export function PageHero({ crumb, title, lead, img }: { crumb: [string, string?][]; title: string; lead?: string; img?: string }) {
  return (
    <section className={`page-hero ${img ? "has-img" : ""}`}>
      {img && <Image src={img} alt="" fill priority sizes="100vw" className="hero-img" />}
      <div className="page-hero-in">
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link href="/">Home</Link>
          {crumb.map(([label, href]) => (
            <span key={label}>
              <Icon name="chev" size="sm" />
              {href ? <Link href={href}>{label}</Link> : <span aria-current="page">{label}</span>}
            </span>
          ))}
        </nav>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
    </section>
  );
}

export function Section({ eyebrow, title, lead, children, id }: { eyebrow?: string; title?: string; lead?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="pub-sec" id={id}>
      {(eyebrow || title || lead) && (
        <div className="pub-sec-h">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          {title && <h2>{title}</h2>}
          {lead && <p className="muted lead">{lead}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Text beside a photo; stacks on phones */
export function Split({ img, alt, children }: { img: string; alt: string; children: ReactNode }) {
  return (
    <div className="welcome">
      <div className="welcome-img">
        <Image src={img} alt={alt} fill sizes="(max-width: 860px) 100vw, 420px" />
      </div>
      <div className="stack prose">{children}</div>
    </div>
  );
}

export function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="checklist">
      {items.map((i) => <li key={i}><Icon name="check" size="sm" />{i}</li>)}
    </ul>
  );
}

/** Links to the other pages in the same menu group, e.g. the four About pages */
export function SectionLinks({ group, current }: { group: string; current: string }) {
  const item = PUBLIC_NAV.find((n) => n.label === group);
  const others = item?.children?.filter((c) => c.href !== current) ?? [];
  if (!others.length) return null;
  return (
    <section className="pub-sec">
      <div className="sec-links">
        <span className="eyebrow">More in {group}</span>
        <div className="row">
          {others.map((c) => (
            <Link key={c.href} className="btn" href={c.href}>{c.label}<Icon name="chev" size="sm" /></Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MapEmbed() {
  return (
    <div className="map-frame">
      <iframe
        title={`Map showing ${SCHOOL.name}, ${SCHOOL.address.line2}`}
        src={`https://maps.google.com/maps?q=${encodeURIComponent(SCHOOL.mapQuery)}&z=15&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}

/** Closing banner on inner pages, worded from the current admission status */
export function AdmissionCta() {
  return (
    <section className="pub-sec">
      <div className="store-cta">
        <div className="stack tight">
          <h2>Ready to join {SCHOOL.name}?</h2>
          <p>{ADMISSION.open ? `Admission for the ${ADMISSION.session} session is open. Apply online or visit the school office.` : ADMISSION.closedNote}</p>
        </div>
        <div className="row">
          <Link className="btn primary lg" href="/admissions/process">How admission works</Link>
          <Link className="btn lg hero-ghost" href="/contact">Contact us</Link>
        </div>
      </div>
    </section>
  );
}
