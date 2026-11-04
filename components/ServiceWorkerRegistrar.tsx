"use client";

import { useEffect } from "react";

/** Registra el service worker que hace instalable el panel. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) =>
        console.error("No se pudo registrar el service worker", error),
      );
  }, []);

  return null;
}
