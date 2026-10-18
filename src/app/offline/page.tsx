import Image from "next/image";
import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";

export const metadata: Metadata = { title: "No connection" };
export const dynamic = "force-static";

/** Shown by the installed app (public/sw.js) when the phone has no connection */
export default function OfflinePage() {
  return (
    <main className="offline">
      <Image src="/logo.png" alt="" width={72} height={72} priority />
      <h1>No internet connection</h1>
      <p className="muted">The {SCHOOL.storeName} needs a connection. Check your mobile data or Wi-Fi, then try again.</p>
      {/* A plain link (not a script button) so it works even before the page's scripts load */}
      <a className="btn primary lg" href="/home">Try again</a>
      <p className="small muted">Your orders and payments are safe: nothing is lost while you&apos;re offline.</p>
    </main>
  );
}
