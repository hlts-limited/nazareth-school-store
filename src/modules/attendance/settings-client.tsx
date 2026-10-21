"use client";

import { useState } from "react";
import type { ActionResult } from "@/shared/lib/action";
import { ActionForm, CopyButton, SubmitButton } from "@/shared/ui/client";
import { Icon } from "@/shared/ui/icon";

/**
 * How to find the school's coordinates. Location access is only allowed on the staff clock-in page, so HR types
 * the two numbers in, taken from Google Maps.
 */
export function UseMyLocation() {
  return (
    <span className="small muted row tight">
      <Icon name="pin" size="sm" />
      In Google Maps, press and hold the school gate, then copy the two numbers shown (for example 6.4659, 3.2847)
      into Latitude and Longitude.
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
