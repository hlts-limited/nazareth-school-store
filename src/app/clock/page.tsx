import { redirect } from "next/navigation";
import { getViewer } from "@/modules/auth";

export const dynamic = "force-dynamic";

/** The short link staff save on their phones: straight to the scanner, signing in first if needed. */
export default async function ClockShortcut() {
  const v = await getViewer();
  redirect(v?.kind === "staff" ? "/admin/me/clock" : "/login?tab=staff&next=clock");
}
