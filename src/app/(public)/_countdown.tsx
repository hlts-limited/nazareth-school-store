"use client";

import { useEffect, useState } from "react";

const SHOW_FROM = 10 * 24 * 3600_000;

/**
 * Live countdown to an event. It only appears in the last 10 days before the start, and says "Happening now"
 * while the event is on. It renders after the page loads, so the server and the visitor's clock never disagree.
 */
export function Countdown({ startsAt, endsAt }: { startsAt: string; endsAt: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;

  const start = Date.parse(startsAt);
  const end = endsAt ? Date.parse(endsAt) : start + 24 * 3600_000;
  const left = start - now;
  if (left <= 0) return now < end ? <div className="cd live"><span className="cd-dot" />Happening now</div> : null;
  if (left > SHOW_FROM) return null;

  const s = Math.floor(left / 1000);
  const parts: [number, string][] = [[Math.floor(s / 86400), "Days"], [Math.floor(s / 3600) % 24, "Hours"], [Math.floor(s / 60) % 60, "Mins"], [s % 60, "Secs"]];
  const days = parts[0][0];
  return (
    <div className="cd" role="timer" aria-label={`Starts in ${days} day${days === 1 ? "" : "s"}, ${parts[1][0]} hours and ${parts[2][0]} minutes`}>
      <span className="cd-lead">Starts in</span>
      <div className="cd-units" aria-hidden="true">
        {parts.map(([v, label]) => (
          <span key={label} className="cd-unit">
            <b key={v} className="cd-num">{String(v).padStart(2, "0")}</b>
            <small>{label}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
