import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { SCHOOL } from "@/shared/config/school";
import { ToastProvider } from "@/shared/ui/client";
import "./globals.css";

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
  return (
    <html lang="en-NG" className={`${display.variable} ${body.variable}`} data-theme={theme === "dark" || theme === "light" ? theme : undefined}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
