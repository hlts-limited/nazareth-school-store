"use client";

import { useEffect, useRef } from "react";

// Decorative 3D scene for the sign-in page (pure CSS 3D; the pointer only tilts it).
export function LoginScene() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = host.getBoundingClientRect();
        el.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        el.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      });
    };
    const leave = () => { el.style.setProperty("--mx", "0"); el.style.setProperty("--my", "0"); };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(frame); host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", leave); };
  }, []);

  return (
    <div className="scene" ref={ref} aria-hidden="true">
      <div className="stage">
        {Array.from({ length: 7 }, (_, i) => <i key={i} className="ring" style={{ "--k": i } as React.CSSProperties} />)}
        <Book className="book-a" />
        <Book className="book-b" />
        <div className="pencil"><div className="box"><i className="f1" /><i className="f2" /><i className="f3" /><i className="f4" /></div><b /></div>
        <span className="orb o1" /><span className="orb o2" /><span className="orb o3" />
      </div>
    </div>
  );
}

function Book({ className }: { className: string }) {
  return (
    <div className={`book ${className}`}>
      <div className="box">
        <i className="front"><span /><span /><span /></i>
        <i className="back" />
        <i className="spine" />
        <i className="pages" />
        <i className="top" />
        <i className="bottom" />
      </div>
    </div>
  );
}
