import type { Metadata } from "next";
import Link from "next/link";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { HOW_TO_BUY_STEPS, HOW_TO_BUY_VIDEO } from "@/shared/config/how-to-buy";
import { HowToBuyVideo } from "@/shared/ui/how-to-buy";
import { PageHero } from "../_parts";

export const metadata: Metadata = { title: "How to buy from the School Store", description: "A step-by-step video and guide for parents buying books and uniforms from the Nazareth School Store." };

/** A page parents can be sent on WhatsApp: the video, and the same steps written out. */
export default function HowToBuyPage() {
  return (
    <>
      <PageHero crumb={[["School Store", "/login"], ["How to buy"]]} title="How to buy from the School Store" lead="Watch the short video, or follow the steps below. Take your time: you can pause at any step." />
      <section className="pub-sec">
        <div className="htb">
          <div className="htb-player">
            <HowToBuyVideo />
            <p className="small muted" style={{ textAlign: "center" }}>{HOW_TO_BUY_VIDEO.length} · with voice and captions</p>
          </div>
          <div className="stack">
            <ol className="htb-steps">
              {HOW_TO_BUY_STEPS.map(([title, sub], i) => (
                <li key={title}><span className="htb-n">{i + 1}</span><span><b>{title}</b><small>{sub}</small></span></li>
              ))}
            </ol>
            <div className="row">
              <Link className="btn primary lg" href="/login"><Icon name="users" size="sm" />Sign in to the School Store</Link>
              <a className="btn lg" href={SCHOOL.social.whatsapp} target="_blank" rel="noopener"><Icon name="chat" size="sm" />Ask the office on WhatsApp</a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
