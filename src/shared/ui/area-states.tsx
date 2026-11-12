"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Shown in place of one page when it fails, while the menu and the rest of the app keep working.
 * The reference (digest) matches the server log, so the school can report exactly which error it was.
 */
export function AreaError({ error, reset, home, homeLabel }: { error: Error & { digest?: string }; reset: () => void; home: string; homeLabel: string }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="area-error" role="alert">
      <h2>This page didn&apos;t load</h2>
      <p className="muted">Please try again. If it keeps happening, tell the school office{error.digest ? <> and quote reference <span className="mono">{error.digest}</span></> : null}.</p>
      <div className="row">
        <button className="btn primary" type="button" onClick={() => reset()}>Try again</button>
        <Link className="btn" href={home}>{homeLabel}</Link>
      </div>
    </div>
  );
}
