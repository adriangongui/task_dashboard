"use client";

import { useCallback, useEffect, useState } from "react";

type Estado =
  | "cargando"
  | "inactivo"
  | "activo"
  | "bloqueado"
  | "no-soportado"
  | "instalar-ios"
  | "error";

function esIOS(): boolean {
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

function estaInstalada(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function claveABytes(base64: string): Uint8Array {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(normal);
  const bytes = new Uint8Array(crudo.length);

  for (let i = 0; i < crudo.length; i += 1) {
    bytes[i] = crudo.charCodeAt(i);
  }

  return bytes;
}

const TEXTO: Record<Estado, string> = {
  cargando: "Comprobando si este dispositivo puede recibir avisos…",
  inactivo:
    "Recibe cada recordatorio como notificación de la app, aunque esté cerrada. En Android el móvil también vibra.",
  activo:
    "Avisos activados en este dispositivo. Llegan aunque la app esté cerrada; en Android con vibración.",
  bloqueado:
    "El navegador tiene bloqueadas las notificaciones para esta web. Ábrelas en los ajustes del sitio y vuelve a entrar.",
  "no-soportado":
    "Este navegador no admite notificaciones push. En iPhone necesitas iOS 16.4 o superior.",
  "instalar-ios":
    "En iPhone primero añade la app a la pantalla de inicio (Compartir → Añadir a pantalla de inicio), ábrela desde ese icono y activa aquí los avisos.",
  error: "No se pudieron activar los avisos en este dispositivo.",
};

export default function PushNotificaciones() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [ocupado, setOcupado] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);

  const revisar = useCallback(async () => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setEstado("no-soportado");
      return;
    }

    if (esIOS() && !estaInstalada()) {
      setEstado("instalar-ios");
      return;
    }

    if (Notification.permission === "denied") {
      setEstado("bloqueado");
      return;
    }

    try {
      const registro = await navigator.serviceWorker.getRegistration("/");
      const suscripcion = await registro?.pushManager.getSubscription();
      setEstado(suscripcion ? "activo" : "inactivo");
    } catch {
      setEstado("inactivo");
    }
  }, []);

  useEffect(() => {
    void revisar();
  }, [revisar]);

  async function activar() {
    setOcupado(true);
    setDetalle(null);

    try {
      const permiso =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
        return;
      }

      const registro = await navigator.serviceWorker.register(
        "/service-worker.js",
      );
      await navigator.serviceWorker.ready;

      const respuestaClave = await fetch("/api/push/clave", {
        cache: "no-store",
      });
      const cuerpoClave = await respuestaClave.json();

      if (!respuestaClave.ok || !cuerpoClave?.clave) {
        throw new Error(cuerpoClave?.error ?? "No se pudo preparar el aviso");
      }

      let suscripcion = await registro.pushManager.getSubscription();

      if (!suscripcion) {
        suscripcion = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: claveABytes(
            cuerpoClave.clave as string,
          ) as BufferSource,
        });
      }

      const guardar = await fetch("/api/push/suscribir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(suscripcion.toJSON()),
      });
      const cuerpoGuardar = await guardar.json();

      if (!guardar.ok) {
        throw new Error(
          cuerpoGuardar?.error ?? "No se pudo guardar el dispositivo",
        );
      }

      setEstado("activo");
      setDetalle("Listo. Pulsa «Probar» para comprobar que llega y vibra.");
    } catch (error) {
      setEstado("error");
      setDetalle(
        error instanceof Error
          ? error.message
          : "No se pudieron activar los avisos",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    setDetalle(null);

    try {
      const respuesta = await fetch("/api/push/probar", { method: "POST" });
      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(cuerpo?.error ?? "No se pudo enviar la prueba");
      }

      setDetalle("Prueba enviada. Debería aparecer en unos segundos.");
    } catch (error) {
      setDetalle(
        error instanceof Error ? error.message : "No se pudo enviar la prueba",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    setDetalle(null);

    try {
      const registro = await navigator.serviceWorker.getRegistration("/");
      const suscripcion = await registro?.pushManager.getSubscription();

      if (suscripcion) {
        await fetch("/api/push/suscribir", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: suscripcion.endpoint }),
        });
        await suscripcion.unsubscribe();
      }

      setEstado("inactivo");
      setDetalle("Avisos desactivados en este dispositivo.");
    } catch (error) {
      setDetalle(
        error instanceof Error
          ? error.message
          : "No se pudieron desactivar los avisos",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-white px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="mt-0.5 h-4 w-4 shrink-0 text-[#C08A2E]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5M10 19a2.2 2.2 0 0 0 4 0" />
        </svg>

        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-ink">
            Avisos en el móvil
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#6C675E]">
            {TEXTO[estado]}
          </p>
          {detalle ? (
            <p
              role="status"
              className="mt-1 text-[11.5px] leading-relaxed text-[#A63C60]"
            >
              {detalle}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {estado === "activo" ? (
            <>
              <button
                type="button"
                onClick={() => void probar()}
                disabled={ocupado}
                className="rounded-[9px] border border-line bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink transition hover:bg-canvas disabled:opacity-60"
              >
                {ocupado ? "…" : "Probar"}
              </button>
              <button
                type="button"
                onClick={() => void desactivar()}
                disabled={ocupado}
                className="rounded-[9px] px-2 py-0.5 text-[11px] font-medium text-muted transition hover:text-ink disabled:opacity-60"
              >
                Desactivar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void activar()}
              disabled={
                ocupado ||
                estado === "cargando" ||
                estado === "bloqueado" ||
                estado === "no-soportado" ||
                estado === "instalar-ios"
              }
              className="rounded-[9px] bg-ink px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-[#111110] disabled:opacity-40"
            >
              {ocupado ? "…" : "Activar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
