import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { SCHOOL } from "@/shared/config/school";
import { ToastProvider } from "@/shared/ui/client";
import { ServiceWorker } from "@/shared/ui/pwa";
import { isLite } from "@/shared/lib/lite";
// Styles, in cascade order (see src/styles): shared base first, then each part of the app
import "@/styles/01-base.css";
import "@/styles/02-login.css";
import "@/styles/03-shell.css";
import "@/styles/04-store.css";
import "@/styles/05-website.css";
import "@/styles/06-motion.css";
import "@/styles/07-staff.css";
import "@/styles/08-charts.css";
import "@/styles/09-features.css";
import "@/styles/10-back-office.css";

const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: SCHOOL.storeName, template: `%s · ${SCHOOL.storeName}` },
  description: `Books, uniforms and school accessories for ${SCHOOL.name} pupils.`,
  applicationName: SCHOOL.storeName,
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: SCHOOL.shortName, statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#D7262D" }, { media: "(prefers-color-scheme: dark)", color: "#141213" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("naz_theme")?.value;
  const lite = await isLite();
  return (
    <html lang="en-NG" className={`${display.variable} ${body.variable}`} data-theme={theme === "dark" || theme === "light" ? theme : undefined} data-lite={lite ? "1" : undefined}>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
