"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import type { ActionResult } from "@/shared/lib/action";
import { Icon } from "@/shared/ui/icon";

type Pos = { lat: number; lng: number; accuracy: number };
type Scan = (code: string | null, pos?: Pos | null) => Promise<ActionResult>;
type Complete = (s: ActionResult, f: FormData) => Promise<ActionResult>;
type Step = "start" | "scanning" | "checking" | "photo" | "sending" | "done" | "error";

/**
 * Clock in or out. Each step can be switched on or off by the school (Attendance settings):
 * location (checked first, then again at the end), the gate QR code (check 1 on the server) and a live photo of the
 * set spot (check 2). Pictures only ever come from the live camera: there is no file picker on this screen.
 */
export function ClockIn({ scan, complete, next, photoSpot, needGps, needQr, needPhoto }: {
  scan: Scan; complete: Complete; next: "in" | "out"; photoSpot: string; needGps: boolean; needQr: boolean; needPhoto: boolean;
}) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const pos = useRef<Pos | null>(null);
  const [step, setStep] = useState<Step>("start");
  const [msg, setMsg] = useState("");
  const [token, setToken] = useState<{ id: string; kind: string; until: number; photo: boolean } | null>(null);
  const [left, setLeft] = useState(60);

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  // Countdown for the 60-second capture token
  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((token.until - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [token]);

  const fail = (m: string) => { stop(); setMsg(m); setStep("error"); setToken(null); };

  async function finish(t: { id: string }, photo: Blob | null) {
    setStep("sending");
    const fd = new FormData();
    fd.set("token", t.id);
    if (photo) fd.set("photo", new File([photo], "clock.jpg", { type: "image/jpeg" }));
    if (pos.current) { fd.set("lat", String(pos.current.lat)); fd.set("lng", String(pos.current.lng)); fd.set("accuracy", String(pos.current.accuracy)); }
    const r = await complete({ ok: false }, fd);
    stop();
    if (!r.ok) return fail(r.message ?? "That didn't work. Please try again.");
    setMsg(r.message ?? "Done.");
    setStep("done");
    router.refresh();
  }

  async function openCamera() {
    if (stream.current) return true;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
    } catch { fail("The camera is needed to clock in. Allow camera access for this site in your browser, then try again."); return false; }
    const v = video.current!;
    v.srcObject = stream.current;
    await v.play().catch(() => undefined);
    return true;
  }

  async function onCode(code: string | null) {
    setStep("checking");
    const r = await scan(code, pos.current);
    if (!r.ok) return fail(r.message ?? "That code wasn't accepted.");
    const d = r.data as { token: string; kind: string; photoRequired: boolean };
    const t = { id: d.token, kind: d.kind, until: Date.now() + 58_000, photo: d.photoRequired };
    setToken(t);
    if (!d.photoRequired) return finish(t, null);
    if (!(await openCamera())) return;
    setStep("photo");
  }

  function scanLoop() {
    const v = video.current, c = canvas.current;
    if (!v || !c || !stream.current) return;
    if (v.readyState >= 2) {
      const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, w, h);
      const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
      if (found?.data?.startsWith("NZQ1.")) return void onCode(found.data);
    }
    raf.current = requestAnimationFrame(scanLoop);
  }

  async function begin() {
    setMsg("");
    pos.current = null;
    if (needGps) {
      setStep("checking");
      try {
        pos.current = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(
          (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), rej, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }));
      } catch { return fail("Location is needed to clock in. Allow location for this site in your browser, then try again."); }
    }
    // No gate code: start straight away (the location is checked now)
    if (!needQr) return onCode(null);
    if (!(await openCamera())) return;
    setStep("scanning");
    raf.current = requestAnimationFrame(scanLoop);
  }

  function takePhoto() {
    const v = video.current, c = canvas.current;
    if (!v || !c || !token) return;
    // From the live video frame, about 200 KB
    const scale = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => (b ? void finish(token, b) : fail("The photo couldn't be taken. Please try again.")), "image/jpeg", 0.72);
  }

  const live = step === "scanning" || step === "checking" || step === "photo";
  return (
    <div className="card stack clock">
      <div className={`clock-view${live ? " on" : ""}`}>
        <video ref={video} playsInline muted aria-label="Camera" />
        {step === "scanning" && <div className="clock-frame" aria-hidden="true" />}
        <canvas ref={canvas} hidden />
      </div>

      {step === "start" && (
        <>
          <p>
            {needGps ? "Your location is checked to confirm you are at your branch. " : ""}
            {needQr ? "Point your camera at the code on the gate screen. " : ""}
            {needPhoto ? `${needQr ? "Then take" : "Take"} a photo of ${photoSpot}.` : ""}
          </p>
          <button className="btn primary lg block" type="button" onClick={begin}><Icon name={needQr ? "qr" : "clock"} />{next === "in" ? "Clock in" : "Clock out"}</button>
        </>
      )}
      {step === "scanning" && <p className="center muted">Looking for the gate code…</p>}
      {step === "checking" && <p className="center muted">{needQr ? "Checking…" : needGps ? "Checking your location…" : "Starting…"}</p>}
      {step === "photo" && token && (
        <>
          <p className="center"><b>Now photograph {photoSpot}.</b> <span className="muted">({left}s)</span></p>
          <button className="btn primary lg block" type="button" onClick={takePhoto} disabled={left === 0}><Icon name="check" />Take photo and {token.kind === "in" ? "clock in" : "clock out"}</button>
          {left === 0 && <button className="btn block" type="button" onClick={() => { setToken(null); setStep("start"); stop(); }}>Time ran out: start again</button>}
        </>
      )}
      {step === "sending" && <p className="center muted">Saving…</p>}
      {step === "done" && <div className="note ok" role="status"><Icon name="check" /><span><b>{msg}</b></span></div>}
      {step === "error" && (
        <>
          <div className="note err" role="alert"><Icon name="alert" /><span>{msg}</span></div>
          <button className="btn block" type="button" onClick={() => { setStep("start"); setMsg(""); }}>Try again</button>
        </>
      )}
    </div>
  );
}
