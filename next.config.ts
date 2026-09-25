import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content Security Policy: only our own origin, plus Paystack's hosted checkout (we redirect to it).
const csp = [
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
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
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
  async headers() {
    // /api/files sets its own headers (so PDF receipts can be previewed)
    return [{ source: "/((?!api/files).*)", headers: securityHeaders }];
  },
};

export default nextConfig;
