import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { HowToBuyButton } from "@/shared/ui/how-to-buy";
import { upcomingEvents } from "@/modules/website";
import { EventCard } from "./_events";
import { SCHOOLS } from "./_content";

export const metadata: Metadata = {
  title: { absolute: `${SCHOOL.name} · ${SCHOOL.tagline}` },
};


const REASONS: [string, string, string][] = [
  ["shield", "Faith & discipline", "Built on a strong foundation of faith, discipline, and academic excellence."],
  ["users", "Dedicated teachers", "Experienced educators who nurture every child's intellect and character."],
  ["layers", "Modern facilities", "Computer and science laboratories, a library, and sports facilities."],
];

export default async function HomePage() {
  const events = await upcomingEvents(3);
  return (
    <>
      <section className="hero">
        <Image src="/images/cultural-day/01.jpg" alt="" fill priority sizes="100vw" className="hero-img" />
        <div className="hero-in">
          <span className="hero-motto">{SCHOOL.motto}</span>
          <h1>Welcome to {SCHOOL.name}</h1>
          <p>{SCHOOL.tagline}. We nurture academic excellence, moral values, and leadership skills in every child entrusted to our care.</p>
          <div className="row">
            <Link className="btn primary lg" href="/login"><Icon name="shop" size="sm" />School Store</Link>
            <Link className="btn lg hero-ghost" href="/admissions/process">Admissions</Link>
          </div>
        </div>
      </section>

      <section className="pub-sec">
        <div className="pub-sec-h">
          <span className="eyebrow">Our schools</span>
          <h2>From Kindergarten to Primary 6</h2>
        </div>
        <div className="grid g3">
          {SCHOOLS.map((s) => (
            <article key={s.name} className="card pad-0 school-card lift">
              <div className="school-card-img">
                <Image src={s.img} alt={`${s.name} pupils at Cultural Day`} fill sizes="(max-width: 860px) 100vw, 400px" />
                <span className="pill plain">{s.classes}</span>
              </div>
              <div className="stack tight card-b">
                <h3><Link className="card-link" href={s.href}>{s.name}</Link></h3>
                <p className="muted">{s.summary}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="pub-sec">
        <div className="welcome">
          <div className="welcome-img">
            <Image src="/images/irene.jpg" alt={`${SCHOOL.supervisor}, Supervisor`} fill sizes="(max-width: 860px) 100vw, 420px" />
          </div>
          <div className="stack">
            <span className="eyebrow">Welcome message</span>
            <h2>A word from our Supervisor</h2>
            <p>It is with great joy and gratitude that I welcome you to {SCHOOL.name}. Our school is built on a strong foundation of faith, discipline, and academic excellence. We are committed to nurturing every child entrusted to our care — developing not only their intellect but also their character and moral values.</p>
            <p>At {SCHOOL.name}, we believe that every child is gifted and capable of greatness.</p>
            <p className="welcome-sig"><b>{SCHOOL.supervisor}</b><span className="muted"> · Supervisor</span></p>
            <div><Link className="btn" href="/about/welcome">Read the full message<Icon name="chev" size="sm" /></Link></div>
          </div>
        </div>
      </section>

      <section className="pub-sec">
        <div className="pub-sec-h">
          <span className="eyebrow">Why {SCHOOL.name}?</span>
          <h2>Quality education, rooted in values</h2>
        </div>
        <div className="grid g3">
          {REASONS.map(([icon, title, text]) => (
            <div key={title} className="card stack tight reason">
              <span className="reason-ic"><Icon name={icon} /></span>
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {events.length > 0 && (
        <section className="pub-sec">
          <div className="pub-sec-h row between">
            <div className="stack tight"><span className="eyebrow">What&apos;s on</span><h2>Upcoming events</h2></div>
            <Link className="btn" href="/events">All events<Icon name="chev" size="sm" /></Link>
          </div>
          <div className="grid g3">{events.map((e) => <EventCard key={e.id} e={e} />)}</div>
        </section>
      )}

      <section className="pub-sec">
        <div className="store-cta">
          <div className="stack tight">
            <h2>Books and uniforms, in one checkout</h2>
            <p>Shop your children&apos;s booklists online, pay by card or bank transfer, and collect from the school store.</p>
          </div>
          <div className="row">
            <HowToBuyButton className="btn lg hero-ghost" label="How to buy (video)" />
            <Link className="btn primary lg" href="/login">Go to the School Store<Icon name="chev" size="sm" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
