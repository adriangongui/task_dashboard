"use client";

import type { KeyboardEvent } from "react";
import { formatMin } from "@/lib/duration";
import type { Proyecto, Tarea } from "@/lib/types";

interface Props {
  tarea: Tarea;
  proyecto?: Proyecto;
  sugerida?: boolean;
  onToggle: (tarea: Tarea) => void;
  onOpen: (tarea: Tarea) => void;
  onReasignar?: (tarea: Tarea, destino: "hoy" | "semana") => void;
}

export default function TaskCard({
  tarea,
  proyecto,
  sugerida = false,
  onToggle,
  onOpen,
  onReasignar,
}: Props) {
  const hecha = tarea.estado === "hecha";

  function alPulsarTecla(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(tarea);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(tarea)}
      onKeyDown={alPulsarTecla}
      aria-label={`Abrir detalle de ${tarea.titulo}`}
      className={[
        "group relative w-full cursor-pointer rounded-card border bg-white p-3.5 text-left shadow-card transition",
        "hover:-translate-y-px hover:border-[#D9D6CD] hover:shadow-[0_4px_14px_rgba(35,33,30,0.06)]",
        sugerida
          ? "border-hoy/45 bg-hoy/[0.045] ring-2 ring-hoy/20"
          : "border-line",
        hecha ? "opacity-55" : "",
      ].join(" ")}
    >
      {sugerida ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded-full bg-hoy"
        />
      ) : null}

      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={hecha ? "Marcar como pendiente" : "Marcar como hecha"}
          aria-pressed={hecha}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(tarea);
          }}
          className={[
            "mt-[1px] flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[6px] border transition",
            hecha
              ? "border-semana bg-semana text-white"
              : "border-[#D5D2C9] bg-white text-transparent hover:border-semana/70 hover:text-semana/40",
          ].join(" ")}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 8.5 6.5 11.5 12.5 5" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={[
              "text-[14px] font-medium leading-snug tracking-[-0.005em] text-ink",
              hecha ? "line-through decoration-[#B9B5AA]" : "",
            ].join(" ")}
          >
            {tarea.titulo}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tarea.duracion_estimada_min ? (
              <span className="inline-flex items-center rounded-full bg-[#F2F0EA] px-2 py-[3px] text-[11px] font-medium text-[#6C675E]">
                {formatMin(tarea.duracion_estimada_min)}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-[#F7F6F2] px-2 py-[3px] text-[11px] text-muted">
                sin estimar
              </span>
            )}

            {tarea.paralelizable ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-hoy/10 px-2 py-[3px] text-[11px] font-medium text-[#4C4EBE]">
                <span aria-hidden="true">⇄</span> paralelizable
              </span>
            ) : null}

            {proyecto ? (
              <span
                className="inline-flex max-w-[150px] items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium"
                style={{
                  backgroundColor: `${proyecto.color}14`,
                  color: proyecto.color,
                }}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: proyecto.color }}
                />
                <span className="truncate">{proyecto.nombre}</span>
              </span>
            ) : null}
          </div>

          {onReasignar ? (
            <div className="mt-2.5 flex gap-1.5">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onReasignar(tarea, "hoy");
                }}
                className="rounded-full border border-hoy/25 bg-hoy/[0.06] px-2.5 py-1 text-[11.5px] font-medium text-hoy transition hover:bg-hoy/15"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onReasignar(tarea, "semana");
                }}
                className="rounded-full border border-semana/25 bg-semana/[0.06] px-2.5 py-1 text-[11.5px] font-medium text-semana transition hover:bg-semana/15"
              >
                Esta semana
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
