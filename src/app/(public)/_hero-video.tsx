"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/shared/ui/icon";

/**
 * The homepage hero background. The still shows first; the video loads after the page and fades in over it.
 * Phones get the smaller file, and nothing is downloaded with Data Saver on or when motion is turned down.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setSrc(innerWidth < 768 ? "/videos/hero-720.mp4" : "/videos/hero-1080.mp4");
  }, []);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPaused(false); } else { v.pause(); setPaused(true); }
  }

  return (
    <>
      <Image src="/videos/hero-poster.jpg" alt="" fill priority sizes="100vw" className="hero-img" />
      {src && (
        <video ref={ref} className={`hero-video${shown ? " on" : ""}`} src={src} autoPlay muted loop playsInline preload="auto"
          aria-hidden="true" onPlaying={() => setShown(true)} />
      )}
      {shown && (
        <button type="button" className="hero-pause" onClick={toggle} aria-label={paused ? "Play background video" : "Pause background video"}>
          <Icon name={paused ? "resume" : "pause"} size="sm" />
        </button>
      )}
    </>
  );
}
