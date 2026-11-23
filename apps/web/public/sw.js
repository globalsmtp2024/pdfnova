const VERSION = "v1";
const STATIC_CACHE = `pdfnova-static-${VERSION}`;
const PAGE_CACHE = `pdfnova-pages-${VERSION}`;
const SHARE_CACHE = "pdfnova-share";
const OFFLINE_URLS = ["/en/offline", "/ur/offline"];
const STATIC_PREFIXES = ["/_next/static/", "/icons/", "/pdf.worker.min.mjs"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll(OFFLINE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE && key !== SHARE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function storeShared(request) {
  const form = await request.formData();
  const cache = await caches.open(SHARE_CACHE);
  for (const key of await cache.keys()) await cache.delete(key);
  let index = 0;
  for (const value of form.getAll("files")) {
    if (!(value instanceof File) || value.size === 0) continue;
    await cache.put(
      `/__share/${index}`,
      new Response(value, {
        headers: {
          "Content-Type": value.type || "application/octet-stream",
          "X-Filename": encodeURIComponent(value.name),
        },
      }),
    );
    index += 1;
  }
  return Response.redirect("/share", 303);
}

function localeOf(pathname) {
  const first = pathname.split("/").filter(Boolean)[0];
  return first === "ur" ? "ur" : "en";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(storeShared(request));
    return;
  }
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(PAGE_CACHE);
          return (
            (await cache.match(request)) ||
            (await cache.match(`/${localeOf(url.pathname)}/offline`)) ||
            Response.error()
          );
        }),
    );
  }
});
