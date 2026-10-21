"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, CopyButton, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

const GOOD_ENOUGH_M = 10;
const LISTEN_MS = 20_000;

/**
 * "Get precise location" for one branch: stand at that branch's gate and tap it. The phone's GPS is asked for its
 * most accurate fix, several readings are taken for up to 20 seconds, and the best one fills in Latitude and
 * Longitude (stopping early once it's within about 10 m). Shows how accurate it was and a link to check the spot.
 */
export function PreciseLocation({ branch }: { branch: string }) {
  const [state, setState] = useState<{ busy: boolean; msg: string; best?: GeolocationCoordinates }>({ busy: false, msg: "" });

  function start() {
    if (!("geolocation" in navigator)) return setState({ busy: false, msg: "This browser can't share its location. Type the numbers instead." });
    let best: GeolocationCoordinates | undefined;
    let id = 0;
    const finish = (msg?: string) => {
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (!best) return setState({ busy: false, msg: msg ?? "No location found. Go outside near the gate and try again." });
      (document.getElementById(`lat-${branch}`) as HTMLInputElement).value = best.latitude.toFixed(6);
      (document.getElementById(`lng-${branch}`) as HTMLInputElement).value = best.longitude.toFixed(6);
      setState({ busy: false, best, msg: `Got it: accurate to about ${Math.round(best.accuracy)} m. Press Save settings to keep it.` });
    };
    setState({ busy: true, msg: "Finding your precise location… stand still near the gate." });
    const timer = setTimeout(() => finish(), LISTEN_MS);
    id = navigator.geolocation.watchPosition(
      (p) => {
        if (!best || p.coords.accuracy < best.accuracy) best = p.coords;
        setState((s) => ({ ...s, msg: `Improving… accurate to about ${Math.round(best!.accuracy)} m so far.` }));
        if (best.accuracy <= GOOD_ENOUGH_M) finish();
      },
      (err) => finish(err.code === err.PERMISSION_DENIED ? "Location is blocked. Allow location for this site in the browser, then try again." : undefined),
      { enableHighAccuracy: true, maximumAge: 0, timeout: LISTEN_MS },
    );
  }

  return (
    <div className="row tight precise-loc">
      <button type="button" className="btn sm" onClick={start} disabled={state.busy}>
        {state.busy ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icon name="pin" size="sm" />}
        {state.busy ? "Finding location…" : "Get precise location"}
      </button>
      {state.msg && <span className={`small ${state.best && state.best.accuracy > 30 ? "warn-text" : "muted"}`}>{state.msg}{state.best && state.best.accuracy > 30 ? " That's not very precise: try again outside, away from buildings." : ""}</span>}
      {state.best && (
        <a className="small" href={`https://www.google.com/maps?q=${state.best.latitude},${state.best.longitude}`} target="_blank" rel="noopener noreferrer">Check on map</a>
      )}
    </div>
  );
}

/** Create the gate device's link and show it once, to copy onto the device. */
export function KioskLink({ action }: { action: () => Promise<ActionResult> }) {
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="stack tight">
      <ActionForm action={action} onDone={(r) => { if (r.ok && r.data?.link) setLink(String(r.data.link)); }}>
        <SubmitButton size="sm" variant="default" icon="qr" confirmText="Create a new gate screen link? The current gate screen stops working until you open the new link on it.">Create gate screen link</SubmitButton>
      </ActionForm>
      {link && (
        <div className="note ok"><Icon name="check" /><div className="stack tight grow">
          <span className="small">Open this on the gate tablet or phone at each branch (the same link works on all three) and leave it on screen:</span>
          <code className="small" style={{ wordBreak: "break-all" }}>{link}</code>
          <div><CopyButton text={link} label="Copy link" done="Gate link copied." /></div>
        </div></div>
      )}
    </div>
  );
}

export function PrintButton() {
  return <button type="button" className="btn sm" onClick={() => window.print()}><Icon name="print" size="sm" />Print</button>;
}
