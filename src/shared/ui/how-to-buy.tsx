"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "./client";
import { Icon } from "./icon";
import { HOW_TO_BUY_VIDEO } from "@/shared/config/how-to-buy";

/** The video player. Nothing downloads until the parent presses play. */
export function HowToBuyVideo({ autoPlay = false }: { autoPlay?: boolean }) {
  return (
    <video className="htb-video" controls playsInline preload="none" autoPlay={autoPlay} poster={HOW_TO_BUY_VIDEO.poster}>
      <source src={HOW_TO_BUY_VIDEO.src} type="video/mp4" />
      <track kind="captions" srcLang="en" label="English" src={HOW_TO_BUY_VIDEO.captions} default />
      Your browser can&apos;t play this video. <a href={HOW_TO_BUY_VIDEO.src}>Download it</a> instead.
    </video>
  );
}

/** A button that opens the video in a pop-up player */
export function HowToBuyButton({ className = "btn", label = "How to buy: watch the video" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Icon name="play" size="sm" />{label}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="How to buy from the School Store"
        footer={<Link className="btn sm" href="/how-to-buy">Prefer reading? See the steps written out</Link>}>
        <HowToBuyVideo autoPlay />
      </Dialog>
    </>
  );
}
