/* Uncensored Girlfriend PWA: network-only to protect private chats and account data. */
const UG_PWA_VERSION = "uncensored-girlfriend-pwa-v1";
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(request));
});
self.addEventListener("message", event => {
  if (event.data === "UG_PWA_VERSION") {
    event.source?.postMessage({ type: "UG_PWA_VERSION", version: UG_PWA_VERSION });
  }
});
