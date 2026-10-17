"use client";

import { useEffect, useState } from "react";

/** The gate device's screen: the current code, refreshed before it changes every 30 seconds. */
export function GateScreen({ token, school }: { token: string; school: string }) {
  const [code, setCode] = useState<{ img: string; secondsLeft: number | null } | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await fetch(`/api/kiosk/${token}/code`, { cache: "no-store" });
        if (!r.ok) throw new Error();
        const j = (await r.json()) as { img: string; secondsLeft: number | null };
        setCode(j); setErr(false);
        // Fetch again just after the code changes (or every 5 minutes for a printed-style static code)
        timer = setTimeout(load, j.secondsLeft ? (j.secondsLeft + 1) * 1000 : 300_000);
      } catch { setErr(true); timer = setTimeout(load, 5000); }
    };
    void load();
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearTimeout(timer); clearInterval(clock); };
  }, [token]);

  return (
    <main className="gate">
      <h1>{school}</h1>
      <p className="gate-sub">Staff: open <b>Clock in / out</b> on your phone and scan this code</p>
      <div className="gate-code">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {code ? <img src={code.img} alt="Gate code for clocking in" /> : <span>Loading…</span>}
      </div>
      <p className="gate-time">{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Lagos" })}</p>
      {err && <p className="gate-err">Can&apos;t reach the server. Check the internet connection.</p>}
    </main>
  );
}
