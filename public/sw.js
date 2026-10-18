// Service worker for the installed app (registered by src/shared/ui/pwa.tsx).
// It only keeps the site's public building blocks (scripts, styles, fonts, icons, website photos) on the phone,
// so the app opens quickly on a slow connection, and it shows a friendly page when there is no connection.
// Pages, sign-in, orders, receipts and every /api/ request always go to the network and are never stored.
const VERSION = "v1";
const SHELL = `naz-shell-${VERSION}`;
const ASSETS = `naz-assets-${VERSION}`;
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll([OFFLINE, "/logo.png", "/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Files whose name never changes for different content: safe to serve from the phone first
const isAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/images/") ||
  /^\/(logo\.png|icon-\d+\.png|maskable-\d+\.png|icon\.svg|apple-touch-icon\.png|favicon\.ico)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Always the live page; only when there's no connection, the offline page
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && res.type === "basic") cache.put(req, res.clone());
        return res;
      }),
    );
  }
  // Everything else (pages' data, /api/, uploaded files) is left to the browser as normal
});
