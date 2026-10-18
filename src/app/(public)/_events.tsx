import type { Event } from "@prisma/client";
import Image from "next/image";
import type { ReactNode } from "react";
import { Icon } from "@/shared/ui/icon";
import { env } from "@/shared/config/env";
import { SCHOOL } from "@/shared/config/school";
import { isLite } from "@/shared/lib/lite";

const TZ = "Africa/Lagos";
const part = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-GB", { ...o, timeZone: TZ });
const hasTime = (d: Date) => part(d, { hour: "2-digit", minute: "2-digit", hour12: false }) !== "00:00";

/** "Wednesday 14 October, 9:00 am – 2:00 pm" or "14 – 16 October" */
function when(e: Event) {
  const day = (d: Date) => part(d, { weekday: "long", day: "numeric", month: "long" });
  const time = (d: Date) => part(d, { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  if (e.endsAt && part(e.endsAt, { dateStyle: "short" }) !== part(e.startsAt, { dateStyle: "short" })) {
    return `${part(e.startsAt, { day: "numeric", month: "long" })} – ${part(e.endsAt, { day: "numeric", month: "long" })}`;
  }
  const t = hasTime(e.startsAt) ? `, ${time(e.startsAt)}${e.endsAt ? ` – ${time(e.endsAt)}` : ""}` : "";
  return `${day(e.startsAt)}${t}`;
}

/** A WhatsApp link that opens the parent's WhatsApp with the event ready to send to a contact or group */
function shareLink(e: Event) {
  const text = `${e.title} at ${SCHOOL.name}
${when(e)}${e.venue ? `
${e.venue}` : ""}
${env().APP_URL}/events#event-${e.id}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function EventCard({ e, past, className = "", children }: { e: Event; past?: boolean; className?: string; children?: ReactNode }) {
  const photo = e.photoKey && !(await isLite());
  return (
    <article id={`event-${e.id}`} className={`card event-card ${photo ? "has-photo" : ""} ${past ? "past" : ""} ${className}`}>
      {photo && (
        <div className="event-photo">
          <Image src={`/api/files/${e.photoKey}`} alt={e.title} fill sizes="(max-width: 860px) 100vw, 600px" unoptimized />
        </div>
      )}
      <div className="event">
        <div className="event-date" aria-hidden="true">
          <span>{part(e.startsAt, { month: "short" })}</span>
          <b>{part(e.startsAt, { day: "numeric" })}</b>
        </div>
        <div className="stack tight">
          <h3>{e.title}</h3>
          <span className="small muted row tight"><Icon name="clock" size="sm" />{when(e)}</span>
          {e.venue && <span className="small muted row tight"><Icon name="pin" size="sm" />{e.venue}</span>}
          {e.description && <p className="muted event-desc">{e.description}</p>}
          {children}
          {!past && (
            <div className="event-acts">
              <a className="btn sm" href={`/events/${e.id}/calendar`} download><Icon name="calendar" size="sm" />Add to calendar</a>
              <a className="btn sm wa" href={shareLink(e)} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size="sm" />Share on WhatsApp</a>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
