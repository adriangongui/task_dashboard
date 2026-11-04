"use client";

import { useEffect, useMemo } from "react";
import { addDias, fechaLarga, hoyISO, ZONA } from "@/lib/dates";
import { formatMin } from "@/lib/duration";
import type { Proyecto, Tarea } from "@/lib/types";

interface Props {
  tareas: Tarea[];
  proyectos: Map<string, Proyecto>;
  onCerrar: () => void;
}

function etiquetaDia(dia: string, hoy: string): string {
  if (dia === hoy) return "Hoy";
  if (dia === addDias(hoy, -1)) return "Ayer";
  return fechaLarga(new Date(`${dia}T12:00:00`));
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function HechasPanel({ tareas, proyectos, onCerrar }: Props) {
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

  const hoy = hoyISO();

  const porDia = useMemo(() => {
    const mapa = new Map<string, Tarea[]>();
    for (const tarea of tareas) {
      if (!tarea.completed_at) continue;
      const dia = hoyISO(new Date(tarea.completed_at));
      const lista = mapa.get(dia) ?? [];
      lista.push(tarea);
      mapa.set(dia, lista);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) =>
        (b.completed_at ?? "").localeCompare(a.completed_at ?? ""),
      );
    }
    return mapa;
  }, [tareas]);

  const dias = [...porDia.keys()].sort().reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-stretch lg:justify-end">
      <button
        type="button"
        aria-label="Cerrar historial"
        onClick={onCerrar}
        className="absolute inset-0 cursor-default bg-[#23211E]/30 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hechas-titulo"
        className="relative flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-[22px] border border-line bg-white px-5 pb-6 pt-5 shadow-float lg:h-full lg:max-h-none lg:w-[468px] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:px-7 lg:py-7"
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <div>
            <h2
              id="hechas-titulo"
              className="text-[18px] font-semibold tracking-[-0.015em]"
            >
              Hechas · últimos 3 días
            </h2>
            <p className="mt-1 text-[12.5px] text-muted">
              {tareas.length}{" "}
              {tareas.length === 1 ? "tarea completada" : "tareas completadas"}
            </p>
          </div>
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

        {dias.length === 0 ? (
          <p className="mt-6 rounded-card border border-dashed border-line px-4 py-8 text-center text-[12.5px] leading-relaxed text-muted">
            Aún no hay tareas hechas en los últimos 3 días.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {dias.map((dia) => (
              <section key={dia}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5F5A52]">
                    {etiquetaDia(dia, hoy)}
                  </h3>
                  <span className="text-[11px] tabular-nums text-muted">
                    {porDia.get(dia)?.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {(porDia.get(dia) ?? []).map((tarea) => {
                    const proyecto = tarea.proyecto_id
                      ? proyectos.get(tarea.proyecto_id)
                      : undefined;

                    return (
                      <div
                        key={tarea.id}
                        className="rounded-[13px] border border-line bg-white px-3.5 py-3"
                      >
                        <p className="text-[13.5px] font-medium leading-snug text-ink line-through decoration-[#B9B5AA]">
                          {tarea.titulo}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {tarea.completed_at ? (
                            <span className="tabular-nums text-muted">
                              {hora(tarea.completed_at)}
                            </span>
                          ) : null}
                          {tarea.duracion_estimada_min ? (
                            <span className="rounded-full bg-[#F2F0EA] px-2 py-[3px] font-medium text-[#6C675E]">
                              {formatMin(tarea.duracion_estimada_min)}
                            </span>
                          ) : null}
                          {proyecto ? (
                            <span
                              className="inline-flex max-w-[160px] items-center gap-1.5 rounded-full px-2 py-[3px] font-medium"
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
                              <span className="truncate">
                                {proyecto.nombre}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
