"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/shared/ui/icon";
import type { Photo } from "./_photos";

const EVERY = 5000;

/**
 * Homepage slideshow of gallery photos. Each photo fades in and slowly zooms; it moves on every few seconds,
 * stops while the pointer or keyboard focus is on it, and never starts on its own when motion is turned down.
 * Photos load one ahead of the one showing, so the whole album isn't downloaded at once.
 */
export function Slideshow({ photos }: { photos: (Photo & { album: string })[] }) {
  const [at, setAt] = useState(0);
  const [seen, setSeen] = useState(() => new Set([0, 1]));
  const [playing, setPlaying] = useState(true);
  const [held, setHeld] = useState(false);
  const touch = useRef<number | null>(null);
  const n = photos.length;

  const go = useCallback((i: number) => {
    const next = (i + n) % n;
    setAt(next);
    setSeen((s) => (s.has(next) && s.has((next + 1) % n) ? s : new Set([...s, next, (next + 1) % n])));
  }, [n]);

  useEffect(() => { if (matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false); }, []);
  useEffect(() => {
    if (!playing || held || n < 2) return;
    const t = setTimeout(() => go(at + 1), EVERY);
    return () => clearTimeout(t);
  }, [at, playing, held, go, n]);

  if (n === 0) return null;
  const run = playing && !held;

  return (
    <div
      className="slides"
      role="region"
      aria-roledescription="carousel"
      aria-label="Photos from the school gallery"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false); }}
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(at + 1); if (e.key === "ArrowLeft") go(at - 1); }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="slides-stage" aria-live={run ? "off" : "polite"}>
        {photos.map((p, i) => (
          <figure key={p.src} className={`slide${i === at ? " on" : ""}`} aria-hidden={i !== at} aria-roledescription="slide" aria-label={`${i + 1} of ${n}`}>
            {seen.has(i) && <Image src={p.src} alt={p.alt} fill sizes="(max-width: 1240px) 100vw, 1200px" unoptimized={p.uploaded} priority={false} />}
          </figure>
        ))}
        <div className="slides-cap">
          <span className="slides-album">{photos[at].album}</span>
          <span className="slides-count">{at + 1} / {n}</span>
        </div>
        <button type="button" className="slides-btn prev" onClick={() => go(at - 1)} aria-label="Previous photo"><Icon name="back" /></button>
        <button type="button" className="slides-btn next" onClick={() => go(at + 1)} aria-label="Next photo"><Icon name="chev" /></button>
        {run && <span key={at} className="slides-bar" style={{ animationDuration: `${EVERY}ms` }} aria-hidden="true" />}
      </div>
      <div className="slides-foot">
        <div className="slides-dots" role="group" aria-label="Choose a photo">
          {photos.map((p, i) => (
            <button key={p.src} type="button" className={i === at ? "on" : ""} onClick={() => go(i)} aria-label={`Photo ${i + 1}`} aria-current={i === at} />
          ))}
        </div>
        <div className="row tight nowrap">
          <button type="button" className="btn sm" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause slideshow" : "Play slideshow"}>
            <Icon name={playing ? "pause" : "resume"} size="sm" />{playing ? "Pause" : "Play"}
          </button>
          <Link className="btn sm" href="/gallery">Full gallery<Icon name="chev" size="sm" /></Link>
        </div>
      </div>
    </div>
  );
}
