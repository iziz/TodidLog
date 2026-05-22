const APP_VERSION = "190";
const CACHE_NAME = `todidlog-v${APP_VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  `./styles.css?v=${APP_VERSION}`,
  `./vendor/app.js?v=${APP_VERSION}`,
  "./assets/add_list.png",
  "./assets/calendar_toggle.png",
  "./assets/fortune_details.png",
  "./assets/fonts/ChosunGs.woff",
  "./assets/fonts/SangSangFlowerRoad.woff",
  "./assets/refresh_icon.png",
  "./assets/report_icon.png",
  "./assets/tag_icon.png",
  "./assets/task_title_icon.png",
  "./assets/timer_start.png",
  "./assets/timer_stop.png",
  `./manifest.webmanifest?v=${APP_VERSION}`,
  "./icon.svg",
];

const FRESH_PATHS = new Set(["/", "/index.html", "/styles.css", "/vendor/app.js", "/manifest.webmanifest"]);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/service-worker.js") {
    event.respondWith(fetch(new Request(event.request, { cache: "no-store" })));
    return;
  }

  const path = url.pathname.endsWith("/") ? "/" : url.pathname;
  const request = FRESH_PATHS.has(path) ? new Request(event.request, { cache: "reload" }) : event.request;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || !response.ok) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      }),
  );
});
