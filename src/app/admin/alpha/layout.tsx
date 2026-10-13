import { requireStaff } from "@/modules/auth";

/** Every Alpha page: only the Alpha Admin (ALPHA_ADMIN_EMAIL). Each action checks again on the server. */
export default async function AlphaLayout({ children }: { children: React.ReactNode }) {
  await requireStaff("system.alpha");
  return children;
}
