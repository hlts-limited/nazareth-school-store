"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/shared/ui/icon";

// `uploaded` photos come from /api/files and are already resized in the browser, so skip Next's optimiser
type Photo = { src: string; alt: string; uploaded?: boolean };

/** Photo grid; a photo opens full-size in a dialog with previous/next and arrow-key support */
export function Gallery({ photos }: { photos: Photo[] }) {
  const [at, setAt] = useState<number | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);

  const show = (i: number) => { setAt(i); dlg.current?.showModal(); };
  const step = useCallback((d: number) => setAt((i) => (i === null ? i : (i + d + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (at === null) return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, step]);

  const photo = at === null ? null : photos[at];

  return (
    <>
      <div className="gallery">
        {photos.map((p, i) => (
          <button key={p.src} type="button" className="gallery-item" onClick={() => show(i)} aria-label={`Open photo: ${p.alt}`}>
            <Image src={p.src} alt={p.alt} fill sizes="(max-width: 600px) 50vw, (max-width: 1060px) 33vw, 300px" unoptimized={p.uploaded} />
          </button>
        ))}
      </div>
      <dialog ref={dlg} className="lightbox" onClose={() => setAt(null)} onClick={(e) => e.target === dlg.current && dlg.current?.close()} aria-label="Photo viewer">
        {photo && (
          <>
            <div className="lightbox-img">
              <Image src={photo.src} alt={photo.alt} fill sizes="100vw" loading="eager" unoptimized={photo.uploaded} />
            </div>
            <div className="lightbox-bar">
              <span>{photo.alt} · {at! + 1} of {photos.length}</span>
              <div className="row tight">
                <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Previous photo"><Icon name="back" /></button>
                <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Next photo"><Icon name="chev" /></button>
                <button type="button" className="icon-btn" onClick={() => dlg.current?.close()} aria-label="Close"><Icon name="x" /></button>
              </div>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
