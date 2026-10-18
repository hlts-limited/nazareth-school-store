import { cookies, headers } from "next/headers";

/**
 * Data saver: lighter pages for families on mobile data (no background video, no autoplay, smaller photos).
 * The visitor's own choice (the "naz_lite" cookie, set by the footer switch) wins; with no choice yet,
 * it follows the phone's Data Saver setting, which browsers send as the "Save-Data: on" header.
 */
export async function isLite() {
  const choice = (await cookies()).get("naz_lite")?.value;
  if (choice === "1") return true;
  if (choice === "0") return false;
  return (await headers()).get("save-data")?.toLowerCase() === "on";
}
