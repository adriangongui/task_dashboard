"use client";

import { useEffect, useState } from "react";

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Chrome y Edge avisan con `beforeinstallprompt` cuando la PWA cumple los
 * requisitos. Si el evento no llega, no mostramos nada: el navegador aún no
 * la considera instalable (o ya está instalada).
 */
export default function InstallButton() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);
  const [instalada, setInstalada] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    function alPoderInstalar(event: Event) {
      event.preventDefault();
      setEvento(event as EventoInstalacion);
    }

    function alInstalar() {
      setInstalada(true);
      setEvento(null);
    }

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalada(true);
    }

    window.addEventListener("beforeinstallprompt", alPoderInstalar);
    window.addEventListener("appinstalled", alInstalar);

    return () => {
      window.removeEventListener("beforeinstallprompt", alPoderInstalar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (!evento || instalada) return null;

  async function instalar() {
    if (!evento) return;
    setInstalando(true);
    try {
      await evento.prompt();
      const eleccion = await evento.userChoice;
      if (eleccion.outcome === "accepted") {
        setInstalada(true);
      }
      setEvento(null);
    } finally {
      setInstalando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={instalar}
      disabled={instalando}
      className="ml-2 mt-4 inline-flex items-center gap-1.5 rounded-[11px] border border-hoy/25 bg-hoy/[0.07] px-3.5 py-2 text-[13px] font-medium text-hoy transition hover:bg-hoy/15 disabled:opacity-60"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 3.5v8m0 0 3-3m-3 3-3-3M4 13.5v1.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
      </svg>
      {instalando ? "Instalando…" : "Instalar app"}
    </button>
  );
}
