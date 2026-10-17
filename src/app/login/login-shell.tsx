import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { SCHOOL } from "@/shared/config/school";
import { Icon, type IconName } from "@/shared/ui/icon";
import { Note } from "@/shared/ui/primitives";
import { LoginScene } from "./login-scene";

/** The two-panel sign-in layout. Families and staff each get their own wording on the left. */
export function LoginShell({ heading = "Sign in", lines, text, feats, sub, ended, children, footer }: {
  heading?: string;
  lines: [string, string, string];
  text: string;
  feats: [IconName, string][];
  sub: string;
  ended: string | null;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="login">
      <section className="login-art">
        <LoginScene />
        <Link href="/" className="row nowrap rise login-crest" style={{ gap: 14, position: "relative", zIndex: 1 }}>
          <Image src="/logo.png" alt="Nazareth School crest" width={64} height={64} style={{ background: "#fff", borderRadius: 14, padding: 5 }} priority />
          <div>
            <div className="motto">{SCHOOL.motto}</div>
            <div style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, marginTop: 3 }}>{SCHOOL.name}</div>
          </div>
        </Link>
        <div className="stack" style={{ position: "relative", zIndex: 1 }}>
          <h1>{lines.map((l, i) => <span key={i} className={`rise d${i + 1}`}>{l}</span>).reduce<ReactNode[]>((a, s) => (a.length ? [...a, " ", s] : [s]), [])}</h1>
          <p className="rise d4">{text}</p>
        </div>
        <div className="feat">
          {feats.map(([icon, label], i) => <div key={label} className={`rise d${i + 5}`}><Icon name={icon} /> {label}</div>)}
        </div>
      </section>
      <main className="login-form">
        <div className="login-box">
          <Link className="back-link" href="/"><Icon name="back" size="sm" />School website</Link>
          <div className="stack tight"><h2>{heading}</h2><p className="muted">{sub}</p></div>
          {ended && (
            <Note tone="warn" icon="shield">
              {ended === "Signed in on another device"
                ? "You were signed out because this account signed in on another device. Only one device can be signed in at a time."
                : `You were signed out: ${ended.toLowerCase()}.`}
            </Note>
          )}
          {children}
          <p className="small muted" style={{ textAlign: "center" }}>{footer}</p>
        </div>
      </main>
    </div>
  );
}
