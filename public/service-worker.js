/* Service worker del panel: shell offline, estáticos con caché y avisos push. */
const VERSION = "task-dashboard-v5";
const SHELL = [
  "/",
  "/offline.html",
  "/icons/icon-192-v3.png",
  "/icons/icon-512-v3.png",
];

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
        claves
          .filter((clave) => clave !== VERSION)
          .map((clave) => caches.delete(clave)),
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

  // El push se sirve siempre desde la red: nunca una versión cacheada.
  if (url.pathname.startsWith("/api/") || url.pathname === "/service-worker.js") {
    return;
  }

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
    url.pathname.startsWith("/apple-touch-icon")
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

/* Avisos push: recordatorios con vibración larga tipo alarma en Android. */
self.addEventListener("push", (event) => {
  let datos = {};

  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { body: event.data ? event.data.text() : "" };
  }

  const titulo = datos.title || "Recordatorio";
  const opciones = {
    body: datos.body || "Es la hora de tu recordatorio.",
    icon: "/icons/icon-192-v3.png",
    badge: "/icons/icon-192-v3.png",
    tag: datos.tag || "recordatorio",
    renotify: true,
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    // Android usa este patrón al crear el canal de notificaciones. Es lo más
    // parecido a una alarma que permite una notificación web: no puede sonar
    // en bucle ni saltarse el modo silencio del sistema.
    vibrate: [700, 250, 700, 250, 700, 250, 1200],
    data: { url: datos.url || "/" },
    actions: [{ action: "abrir", title: "Abrir" }],
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const destino = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const cliente of clientes) {
        if (cliente.url.startsWith(self.location.origin)) {
          await cliente.focus();
          if ("navigate" in cliente) {
            try {
              await cliente.navigate(destino);
            } catch {
              // Si no se puede navegar, al menos queda enfocada.
            }
          }
          return;
        }
      }

      await self.clients.openWindow(destino);
    })(),
  );
});
