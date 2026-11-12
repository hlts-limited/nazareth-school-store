import { redirect } from "next/navigation";

/** Moved: one page for everyone with access; the Alpha Admin sees extra detail there. */
export default function Moved() {
  redirect("/admin/audit");
}
