import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content Security Policy: only our own origin, plus Paystack's hosted checkout (we redirect to it).
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self' https://checkout.paystack.com",
  "base-uri 'self'",
  "object-src 'self'", // PDF receipts on the review screen
];
const csp = cspDirectives.join("; ");

// Public website pages may also embed the school's YouTube videos and a Google map. Nothing else changes,
// and the store, account and back-office pages keep the strict policy above.
const publicCsp = [...cspDirectives, "frame-src https://www.youtube-nocookie.com https://www.google.com https://maps.google.com"].join("; ");

const headersWith = (policy: string) => [
  { key: "Content-Security-Policy", value: policy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/** Paths served by the public website, src/app/(public). */
const PUBLIC_PATHS = ["/", "/about/:path*", "/schools/:path*", "/academics/:path*", "/admissions/:path*", "/gallery", "/events", "/contact"];

/** Old website addresses (the static .html site) and section roots, sent to the new pages */
const REDIRECTS: [string, string][] = [
  ["/index.html", "/"],
  ["/welcome-address.html", "/about/welcome"],
  ["/history.html", "/about/history"],
  ["/vision-mission.html", "/about/vision"],
  ["/management.html", "/about/management"],
  ["/nursery-primary-school.html", "/schools/pre-school"],
  ["/high-school.html", "/schools/school-b"],
  ["/schools/primary", "/schools/school-a"],
  ["/curriculum.html", "/academics/curriculum"],
  ["/co-curricular.html", "/academics/co-curricular"],
  ["/why-choose-nazareth.html", "/admissions/why-nazareth"],
  ["/admission-process.html", "/admissions/process"],
  ["/admission-faqs.html", "/admissions/faqs"],
  ["/apply-online.html", "/admissions/apply"],
  ["/admission-update.html", "/admissions/results"],
  ["/gallery.html", "/gallery"],
  ["/contact.html", "/contact"],
  ["/admin-login.html", "/login?tab=staff"],
  ["/admin-dashboard.html", "/admin"],
  ["/about", "/about/welcome"],
  ["/schools", "/schools/pre-school"],
  ["/academics", "/academics/curriculum"],
  ["/admissions", "/admissions/process"],
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone", // small self-contained build for Docker / VPS
  // Run "npm run lint" separately; style warnings shouldn't stop a deploy
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "60mb" }, // receipts are capped at 5 MB in code; backups can be large
  },
  serverExternalPackages: ["exceljs", "pdf-lib", "jszip", "bcryptjs", "qrcode"],
  // PDFs (admission letters, invoices) read the logo from disk: ship it with the server functions
  outputFileTracingIncludes: {
    "/admissions/application/**": ["./public/logo.png"],
    "/api/admin/admissions/**": ["./public/logo.png"],
  },
  async redirects() {
    return REDIRECTS.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
  async headers() {
    // /api/files sets its own headers (so PDF receipts can be previewed).
    // When several rules match, the later one wins for the same header, so the public rules come last.
    return [
      { source: "/((?!api/files).*)", headers: headersWith(csp) },
      ...PUBLIC_PATHS.map((source) => ({ source, headers: headersWith(publicCsp) })),
      // Staff clock in with the camera and location, and HR sets the school's location. The back office moves between
      // pages without reloading, so the whole staff area (our own site only) may ask; the public website may not.
      { source: "/admin/:path*", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" }] },
    ];
  },
};

export default nextConfig;
