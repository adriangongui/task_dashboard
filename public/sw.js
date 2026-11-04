/* Service worker mínimo del panel: shell offline + estáticos con caché. */
const VERSION = "task-dashboard-v1";
const SHELL = ["/", "/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const respuesta = await fetch(url, { cache: "reload" });
            if (respuesta.ok) await cache.put(url, respuesta);
          } catch {
            // Sin red en la instalación: seguimos; ya cacheará al navegar.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const claves = await caches.keys();
      await Promise.all(
        claves.filter((clave) => clave !== VERSION).map((clave) => caches.delete(clave)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const peticion = event.request;
  if (peticion.method !== "GET") return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navegación: red primero, con la última copia (o el aviso offline) si falla.
  if (peticion.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const respuesta = await fetch(peticion);
          const cache = await caches.open(VERSION);
          cache.put(peticion, respuesta.clone()).catch(() => {});
          return respuesta;
        } catch {
          return (
            (await caches.match(peticion)) ||
            (await caches.match("/")) ||
            (await caches.match("/offline.html"))
          );
        }
      })(),
    );
    return;
  }

  // Estáticos: caché primero; se rellena en la primera visita.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/apple-touch-icon.png"
  ) {
    event.respondWith(
      (async () => {
        const enCache = await caches.match(peticion);
        if (enCache) return enCache;
        const respuesta = await fetch(peticion);
        if (respuesta.ok) {
          const cache = await caches.open(VERSION);
          cache.put(peticion, respuesta.clone()).catch(() => {});
        }
        return respuesta;
      })(),
    );
  }
});
