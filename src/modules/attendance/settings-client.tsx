"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, CopyButton, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

/** Fill the school location from this device (stand at the gate and press it). */
export function UseMyLocation() {
  const [msg, setMsg] = useState("");
  return (
    <span className="row tight">
      <button type="button" className="btn sm" onClick={() => {
        setMsg("Finding your location…");
        navigator.geolocation.getCurrentPosition((p) => {
          (document.getElementById("as-lat") as HTMLInputElement).value = p.coords.latitude.toFixed(6);
          (document.getElementById("as-lng") as HTMLInputElement).value = p.coords.longitude.toFixed(6);
          setMsg(`Done (accurate to about ${Math.round(p.coords.accuracy)} m). Save to keep it.`);
        }, () => setMsg("Location isn't available. Allow location for this site, or type the numbers."), { enableHighAccuracy: true, timeout: 15_000 });
      }}><Icon name="pin" size="sm" />Use this device&apos;s location</button>
      {msg && <span className="small muted">{msg}</span>}
    </span>
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
          <span className="small">Open this on the gate tablet or phone and leave it on screen:</span>
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
