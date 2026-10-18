import { NextResponse } from "next/server";
import { db } from "@/shared/lib/db";
import { SCHOOL } from "@/shared/config/school";

const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const lagosDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replace(/-/g, "");
const lagosTime = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

/** One event as a calendar file (.ics): phones offer to add it to the calendar when it's opened. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await db.event.findFirst({ where: { id, published: true } });
  if (!e) return new NextResponse("Event not found", { status: 404 });

  // Events saved without a time (midnight in Lagos) are all-day events
  const allDay = lagosTime(e.startsAt) === "00:00" && (!e.endsAt || lagosTime(e.endsAt) === "00:00");
  const end = e.endsAt ?? new Date(e.startsAt.getTime() + (allDay ? 86_400_000 : 2 * 3_600_000));
  const page = `${new URL(req.url).origin}/events#event-${e.id}`;
  const where = [e.venue, SCHOOL.name, SCHOOL.address.line1, SCHOOL.address.line2].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nazareth School//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@nazareth-school`,
    `DTSTAMP:${utc(new Date())}`,
    ...(allDay
      // An all-day end date is the day after the last day
      ? [`DTSTART;VALUE=DATE:${lagosDay(e.startsAt)}`, `DTEND;VALUE=DATE:${lagosDay(new Date((e.endsAt ?? e.startsAt).getTime() + 86_400_000))}`]
      : [`DTSTART:${utc(e.startsAt)}`, `DTEND:${utc(end)}`]),
    `SUMMARY:${esc(`${e.title} · ${SCHOOL.name}`)}`,
    `LOCATION:${esc(where)}`,
    `DESCRIPTION:${esc(`${e.description ? `${e.description}\n\n` : ""}${page}`)}`,
    `URL:${page}`,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${esc(`Tomorrow: ${e.title}`)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event";
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.ics"`, "Cache-Control": "public, max-age=300" },
  });
}
