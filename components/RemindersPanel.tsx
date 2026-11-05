"use client";

import { useCallback, useEffect, useState } from "react";

interface RecordatorioPanel {
  id: string;
  titulo: string;
  detalle: string;
  recordar_at: string;
  enviado: boolean;
  created_at: string;
}

interface Respuesta {
  pendientes: RecordatorioPanel[];
  enviados: RecordatorioPanel[];
}

type Pestana = "proximos" | "enviados";

const COLOR = "#C08A2E";

function fechaRecordatorio(iso: string): string {
  const texto = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function haPasado(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

export default function RemindersPanel({ onCerrar }: { onCerrar: () => void }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [pestana, setPestana] = useState<Pestana>("proximos");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/recordatorios", { cache: "no-store" });
      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(cuerpo?.error ?? "No se pudieron cargar los recordatorios");
      }

      setDatos(cuerpo as Respuesta);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar los recordatorios",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    function alPulsar(event: KeyboardEvent) {
      if (event.key === "Escape") onCerrar();
    }

    document.addEventListener("keydown", alPulsar);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", alPulsar);
      document.body.style.overflow = overflowPrevio;
    };
  }, [onCerrar]);

  async function borrar(id: string) {
    setBorrando(id);
    setError(null);

    try {
      const respuesta = await fetch("/api/recordatorios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "borrar", id }),
      });
      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(cuerpo?.error ?? "No se pudo borrar");
      }

      setDatos((prev) =>
        prev
          ? {
              pendientes: prev.pendientes.filter((r) => r.id !== id),
              enviados: prev.enviados.filter((r) => r.id !== id),
            }
          : prev,
      );
      setConfirmando(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
    } finally {
      setBorrando(null);
    }
  }

  const lista =
    pestana === "proximos" ? datos?.pendientes ?? [] : datos?.enviados ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#23211E]/35 px-3 py-6 backdrop-blur-[2px] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recordatorios-titulo"
        className="relative w-full max-w-[640px] rounded-[22px] border border-line bg-canvas shadow-float"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Recordatorios
            </p>
            <h2
              id="recordatorios-titulo"
              className="mt-0.5 text-[20px] font-semibold tracking-[-0.01em]"
            >
              Próximos avisos
            </h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar recordatorios"
            className="rounded-full p-1.5 text-muted transition hover:bg-white hover:text-ink"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5 5 15" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1.5 px-5 pt-4">
          {(
            [
              { key: "proximos", label: "Próximos", total: datos?.pendientes.length },
              { key: "enviados", label: "Enviados", total: datos?.enviados.length },
            ] as Array<{ key: Pestana; label: string; total?: number }>
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPestana(tab.key)}
              aria-pressed={pestana === tab.key}
              className={[
                "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition",
                pestana === tab.key
                  ? "border-transparent bg-white text-ink shadow-card"
                  : "border-transparent bg-white/50 text-muted hover:bg-white",
              ].join(" ")}
            >
              {tab.label}
              {typeof tab.total === "number" ? (
                <span className="ml-1.5 text-[11px] tabular-nums opacity-60">
                  {tab.total}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="px-5 pb-5 pt-4">
          {error ? (
            <div className="mb-3 rounded-card border border-sinterminar/30 bg-sinterminar/[0.05] px-3.5 py-2.5 text-[12.5px] text-[#A63C60]">
              {error}
            </div>
          ) : null}

          {cargando ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[76px] animate-pulse rounded-card border border-line bg-white/60"
                />
              ))}
            </div>
          ) : lista.length === 0 ? (
            <div className="rounded-panel border border-dashed border-line px-5 py-9 text-center">
              <p className="text-[13px] font-medium text-ink">
                {pestana === "proximos"
                  ? "No hay recordatorios próximos"
                  : "Todavía no se ha enviado ninguno"}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                {pestana === "proximos"
                  ? "Pídelos por Telegram: «recuérdame mañana a las 9:30 llamar al banco»."
                  : "Cuando llegue la hora, el aviso se envía por Telegram y aparece aquí."}
              </p>
            </div>
          ) : (
            <div className="max-h-[52vh] space-y-2.5 overflow-y-auto pr-0.5">
              {lista.map((recordatorio) => {
                const atrasado =
                  !recordatorio.enviado && haPasado(recordatorio.recordar_at);

                return (
                  <article
                    key={recordatorio.id}
                    className="rounded-card border border-line bg-white px-3.5 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: COLOR }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[13.5px] font-medium leading-snug text-ink">
                            {recordatorio.titulo}
                          </h3>
                          {recordatorio.enviado ? (
                            <span className="rounded-full bg-[#F2F0EA] px-2 py-[2px] text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">
                              Enviado
                            </span>
                          ) : atrasado ? (
                            <span className="rounded-full bg-sinterminar/10 px-2 py-[2px] text-[10.5px] font-medium uppercase tracking-[0.05em] text-sinterminar">
                              Pendiente de envío
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-0.5 text-[12px] text-[#6C675E]">
                          {fechaRecordatorio(recordatorio.recordar_at)}
                        </p>

                        {recordatorio.detalle &&
                        recordatorio.detalle.trim() !==
                          recordatorio.titulo.trim() ? (
                          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
                            {recordatorio.detalle}
                          </p>
                        ) : null}
                      </div>

                      {confirmando === recordatorio.id ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void borrar(recordatorio.id)}
                            disabled={borrando === recordatorio.id}
                            className="rounded-[9px] bg-sinterminar px-2 py-1 text-[11.5px] font-medium text-white transition hover:bg-[#BD426B] disabled:opacity-60"
                          >
                            {borrando === recordatorio.id ? "…" : "Sí"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmando(null)}
                            disabled={borrando === recordatorio.id}
                            className="rounded-[9px] border border-line bg-white px-2 py-1 text-[11.5px] font-medium text-muted transition hover:text-ink disabled:opacity-60"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmando(recordatorio.id)}
                          aria-label={`Borrar recordatorio ${recordatorio.titulo}`}
                          className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-canvas hover:text-sinterminar"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 6.5h12M8 6.5V4.8h4v1.7M6 6.5l.7 8.2h6.6l.7-8.2M8.6 9v3.4M11.4 9v3.4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <p className="mt-4 border-t border-line pt-3 text-[11.5px] leading-relaxed text-muted">
            Los recordatorios se crean por Telegram y llegan al chat a la hora
            indicada. Aquí puedes revisarlos y borrarlos antes o después.
          </p>
        </div>
      </div>
    </div>
  );
}
