"use client";

import { useEffect, useState } from "react";
import { formatMin } from "@/lib/duration";
import type { Proyecto, Tarea } from "@/lib/types";

interface Props {
  tarea: Tarea;
  proyecto?: Proyecto;
  onCerrar: () => void;
  onGuardarDuracion: (tarea: Tarea, minutos: number | null) => Promise<void>;
  onAlternarHecha: (tarea: Tarea) => Promise<void>;
}

const ETIQUETA_TIPO: Record<Tarea["tipo"], string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  proyecto: "Proyecto",
};

const COLOR_TIPO: Record<Tarea["tipo"], string> = {
  hoy: "#5B5DD6",
  semana: "#22A06B",
  proyecto: "#D97757",
};

export default function TaskDetailPanel({
  tarea,
  proyecto,
  onCerrar,
  onGuardarDuracion,
  onAlternarHecha,
}: Props) {
  const [duracion, setDuracion] = useState(
    tarea.duracion_estimada_min !== null
      ? String(tarea.duracion_estimada_min)
      : "",
  );
  const [guardando, setGuardando] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

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

  const hecha = tarea.estado === "hecha";

  async function guardar() {
    const limpio = duracion.trim();
    const valor = limpio === "" ? null : Number(limpio);

    if (valor !== null && (!Number.isFinite(valor) || valor <= 0)) {
      setAviso("Introduce minutos válidos (mayor que 0).");
      return;
    }

    setGuardando(true);
    setAviso(null);
    try {
      await onGuardarDuracion(tarea, valor === null ? null : Math.round(valor));
      setAviso("Duración guardada");
    } catch {
      setAviso("No se pudo guardar. Inténtalo otra vez.");
    } finally {
      setGuardando(false);
    }
  }

  async function alternar() {
    setOcupada(true);
    try {
      await onAlternarHecha(tarea);
    } finally {
      setOcupada(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-stretch lg:justify-end">
      <button
        type="button"
        aria-label="Cerrar detalle"
        onClick={onCerrar}
        className="absolute inset-0 cursor-default bg-[#23211E]/30 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalle-titulo"
        className="relative flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-[22px] border border-line bg-white px-5 pb-6 pt-5 shadow-float lg:max-h-none lg:h-full lg:w-[468px] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:px-7 lg:py-7"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em]"
            style={{
              backgroundColor: `${COLOR_TIPO[tarea.tipo]}14`,
              color: COLOR_TIPO[tarea.tipo],
            }}
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: COLOR_TIPO[tarea.tipo] }}
            />
            {ETIQUETA_TIPO[tarea.tipo]}
          </span>

          <button
            type="button"
            onClick={onCerrar}
            className="rounded-full p-1.5 text-muted transition hover:bg-canvas hover:text-ink"
            aria-label="Cerrar"
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

        <h2
          id="detalle-titulo"
          className="text-[20px] font-semibold leading-snug tracking-[-0.015em]"
        >
          {tarea.titulo}
        </h2>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px]">
          {tarea.duracion_estimada_min ? (
            <span className="rounded-full bg-[#F2F0EA] px-2 py-[3px] font-medium text-[#6C675E]">
              {formatMin(tarea.duracion_estimada_min)}
            </span>
          ) : null}
          {tarea.paralelizable ? (
            <span className="rounded-full bg-hoy/10 px-2 py-[3px] font-medium text-[#4C4EBE]">
              ⇄ paralelizable
            </span>
          ) : null}
          {proyecto ? (
            <span
              className="rounded-full px-2 py-[3px] font-medium"
              style={{
                backgroundColor: `${proyecto.color}14`,
                color: proyecto.color,
              }}
            >
              {proyecto.nombre}
            </span>
          ) : null}
          {tarea.fecha_para ? (
            <span className="text-muted">Asignada al {tarea.fecha_para}</span>
          ) : null}
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Detalle original
          </p>
          <div className="rounded-card border border-line bg-canvas/60 px-3.5 py-3 text-[13.5px] leading-relaxed text-[#3A3630]">
            <p className="whitespace-pre-wrap break-words">{tarea.detalle}</p>
          </div>
        </div>

        <div className="mt-5">
          <label
            htmlFor="duracion"
            className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
          >
            Duración estimada
          </label>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-[12px] border border-line bg-white px-3 py-2 focus-within:border-hoy/45">
              <input
                id="duracion"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={duracion}
                onChange={(event) => {
                  setDuracion(event.target.value);
                  if (aviso) setAviso(null);
                }}
                placeholder="minutos"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted/70"
              />
              <span className="shrink-0 text-xs text-muted">min</span>
            </div>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="rounded-[12px] border border-line bg-white px-3.5 py-2 text-[13px] font-medium transition hover:border-[#D5D1C7] hover:bg-canvas disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
          {aviso ? (
            <p className="mt-1.5 text-xs text-muted">{aviso}</p>
          ) : null}
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={alternar}
            disabled={ocupada}
            className={[
              "flex-1 rounded-[12px] px-4 py-2.5 text-[13.5px] font-medium text-white transition disabled:opacity-60",
              hecha
                ? "bg-[#6C675E] hover:bg-[#5C5850]"
                : "bg-ink hover:bg-[#111110]",
            ].join(" ")}
          >
            {hecha ? "Reabrir tarea" : "Marcar como hecha"}
          </button>
        </div>
      </div>
    </div>
  );
}
