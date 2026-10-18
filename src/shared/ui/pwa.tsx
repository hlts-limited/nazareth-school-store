"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon } from "./icon";

/** Registers public/sw.js (live site only: in development it would keep old files around) */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const KEY = "naz-install-hidden";
const HIDE_DAYS = 30;

/**
 * "Add the School Store to your phone". Android (Chrome) gets an Install button; iPhone gets the two taps to do in
 * Safari. Not shown once installed, and "Not now" hides it for 30 days.
 */
export function InstallBanner() {
  const [kind, setKind] = useState<"android" | "ios" | null>(null);
  const [evt, setEvt] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone) return;
    try { if (Number(localStorage.getItem(KEY) ?? 0) > Date.now()) return; } catch {}
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)) setKind("ios");
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); setKind("android"); };
    const onInstalled = () => setKind(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  function hide() {
    try { localStorage.setItem(KEY, String(Date.now() + HIDE_DAYS * 86_400_000)); } catch {}
    setKind(null);
  }
  async function install() {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") setKind(null); else hide();
  }

  if (!kind) return null;
  return (
    <aside className="install" aria-label="Install the app">
      <Image src="/icon-192.png" alt="" width={44} height={44} className="install-ic" />
      <div className="install-t">
        <b>Add the School Store to your phone</b>
        {kind === "android"
          ? <span>Open it from your home screen like an app. It loads faster and uses less data.</span>
          : <span>In Safari, tap <Icon name="upload" size="sm" /> <b>Share</b>, then <b>Add to Home Screen</b>.</span>}
      </div>
      <div className="install-a">
        {kind === "android" && <button type="button" className="btn primary sm" onClick={install}>Install</button>}
        <button type="button" className="btn ghost sm" onClick={hide}>Not now</button>
      </div>
    </aside>
  );
}
