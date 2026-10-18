import type { MetadataRoute } from "next";
import { SCHOOL } from "@/shared/config/school";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SCHOOL.storeName,
    short_name: SCHOOL.shortName,
    description: `Books, uniforms and school news for ${SCHOOL.name} families`,
    id: "/home",
    // Parents land on their home page; anyone not signed in is sent to sign in first
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#D7262D",
    shortcuts: [
      { name: "Shop", url: "/shop", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "My orders", url: "/orders", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
