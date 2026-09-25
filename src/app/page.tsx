import { redirect } from "next/navigation";
import { getViewer } from "@/modules/auth";

export default async function Home() {
  const v = await getViewer();
  if (!v) redirect("/login");
  redirect(v.kind === "parent" ? "/home" : v.kind === "pupil" ? "/pupil" : "/admin");
}
