import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SCHOOL } from "@/shared/config/school";
import { GateScreen, kioskTokenValid } from "@/modules/attendance";

export const metadata: Metadata = { title: "Gate code", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Opened on the gate tablet. The link itself is the key: HR can replace it at any time. */
export default async function KioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await kioskTokenValid(token))) notFound();
  const host = (await headers()).get("host") ?? "";
  return <GateScreen token={token} school={SCHOOL.name} clockUrl={`${host}/clock`} />;
}
