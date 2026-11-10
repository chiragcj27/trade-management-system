// Keeps the app installable and shows a clear message when the phone has no network.
const OFFLINE_HTML =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No network</title><body style="font-family:system-ui;padding:32px;background:#F2F5FA;color:#17213A"><h1>No network</h1><p>Beat Register needs a connection right now. Move to better signal and try again.</p><button onclick="location.reload()" style="padding:14px 20px;font-size:16px">Try again</button>';

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_HTML, { headers: { "content-type": "text/html" } })));
});
