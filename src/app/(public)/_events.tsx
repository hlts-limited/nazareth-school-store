import type { Event } from "@prisma/client";
import { Icon } from "@/shared/ui/icon";

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

export function EventCard({ e, past }: { e: Event; past?: boolean }) {
  return (
    <article className={`card event ${past ? "past" : ""}`}>
      <div className="event-date" aria-hidden="true">
        <span>{part(e.startsAt, { month: "short" })}</span>
        <b>{part(e.startsAt, { day: "numeric" })}</b>
      </div>
      <div className="stack tight">
        <h3>{e.title}</h3>
        <span className="small muted row tight"><Icon name="clock" size="sm" />{when(e)}</span>
        {e.venue && <span className="small muted row tight"><Icon name="pin" size="sm" />{e.venue}</span>}
        {e.description && <p className="muted event-desc">{e.description}</p>}
      </div>
    </article>
  );
}
