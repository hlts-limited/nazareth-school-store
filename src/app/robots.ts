import type { MetadataRoute } from "next";

/**
 * Search engines are kept out until the school is ready to be listed (every page also says noindex).
 * At launch, change this to allow "/" and disallow only the private areas (/admin, /api, /home, /orders…).
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
