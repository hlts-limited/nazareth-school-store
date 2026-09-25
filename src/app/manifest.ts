import type { MetadataRoute } from "next";
import { SCHOOL } from "@/shared/config/school";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SCHOOL.storeName,
    short_name: SCHOOL.shortName,
    description: `Books and school accessories for ${SCHOOL.name} pupils`,
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#D7262D",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
