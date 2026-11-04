"use client";

import { formatMin } from "@/lib/duration";
import type { Proyecto, Tarea } from "@/lib/types";
import TaskCard from "./TaskCard";

interface Props {
  proyectos: Proyecto[];
  tareas: Tarea[];
  sugeridas: Set<string>;
  expandidos: Set<string>;
  onAlternarProyecto: (id: string) => void;
  onToggleTarea: (tarea: Tarea) => void;
  onAbrirTarea: (tarea: Tarea) => void;
  zonaActiva?: string | null;
  onPointerDownTarea?: (
    event: React.PointerEvent<HTMLDivElement>,
    tarea: Tarea,
  ) => void;
}

export const SIN_PROYECTO = "sin-proyecto";

export default function ProjectsColumn({
  proyectos,
  tareas,
  sugeridas,
  expandidos,
  onAlternarProyecto,
  onToggleTarea,
  onAbrirTarea,
  zonaActiva,
  onPointerDownTarea,
}: Props) {
  const huerfanas = tareas.filter(
    (t) => t.tipo === "proyecto" && !t.proyecto_id && t.estado === "pendiente",
  );

  if (proyectos.length === 0 && huerfanas.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
        Aún no hay proyectos. Manda algo por Telegram y la IA lo detectará.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {proyectos.map((proyecto) => {
        const delProyecto = tareas.filter((t) => t.proyecto_id === proyecto.id);
        const hechas = delProyecto.filter((t) => t.estado === "hecha").length;
        const total = delProyecto.length;
        const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;
        const pendientes = delProyecto.filter((t) => t.estado === "pendiente");
        const abierto = expandidos.has(proyecto.id);

        return (
          <div
            key={proyecto.id}
            data-destino={`proyecto:${proyecto.id}`}
            className={[
              "overflow-hidden rounded-card border bg-white shadow-card transition",
              zonaActiva === `proyecto:${proyecto.id}`
                ? "border-hoy/50 ring-2 ring-hoy/25"
                : "border-line",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => onAlternarProyecto(proyecto.id)}
              aria-expanded={abierto}
              className="w-full px-3.5 pb-3 pt-3.5 text-left transition hover:bg-canvas/60"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: proyecto.color }}
                />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                  {proyecto.nombre}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted">
                  {hechas}/{total}
                </span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className={[
                    "h-3.5 w-3.5 shrink-0 text-muted transition-transform",
                    abierto ? "rotate-180" : "",
                  ].join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 8l5 5 5-5" />
                </svg>
              </div>

              <div className="mt-2.5 h-[6px] overflow-hidden rounded-full bg-[#EFEDE7]">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: proyecto.color,
                  }}
                />
              </div>

              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                <span>
                  {pendientes.length}{" "}
                  {pendientes.length === 1 ? "pendiente" : "pendientes"}
                </span>
                <span className="tabular-nums">{pct}%</span>
              </div>
            </button>

            {abierto ? (
              <div className="flex flex-col gap-2 border-t border-line bg-canvas/40 p-2.5">
                {pendientes.length === 0 ? (
                  <p className="px-2 py-3 text-center text-[12.5px] text-muted">
                    Nada pendiente en este proyecto 🎉
                  </p>
                ) : (
                  pendientes.map((tarea) => (
                    <TaskCard
                      key={tarea.id}
                      tarea={tarea}
                      proyecto={proyecto}
                      sugerida={sugeridas.has(tarea.id)}
                      onToggle={onToggleTarea}
                      onOpen={onAbrirTarea}
                      onPointerDown={onPointerDownTarea}
                    />
                  ))
                )}
              </div>
            ) : null}
          </div>
        );
      })}

      {huerfanas.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
          <button
            type="button"
            onClick={() => onAlternarProyecto(SIN_PROYECTO)}
            aria-expanded={expandidos.has(SIN_PROYECTO)}
            className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition hover:bg-canvas/60"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-proyecto"
            />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-muted">
              Sin proyecto
            </span>
            <span className="text-[11px] text-muted">{huerfanas.length}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={[
                "h-3.5 w-3.5 text-muted transition-transform",
                expandidos.has(SIN_PROYECTO) ? "rotate-180" : "",
              ].join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 8l5 5 5-5" />
            </svg>
          </button>
          {expandidos.has(SIN_PROYECTO) ? (
            <div className="flex flex-col gap-2 border-t border-line bg-canvas/40 p-2.5">
              {huerfanas.map((tarea) => (
                <TaskCard
                  key={tarea.id}
                  tarea={tarea}
                  sugerida={sugeridas.has(tarea.id)}
                  onToggle={onToggleTarea}
                  onOpen={onAbrirTarea}
                  onPointerDown={onPointerDownTarea}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {proyectos.length > 0 ? (
        <p className="px-1 pt-1 text-[11.5px] text-muted">
          {tareas.filter((t) => t.tipo === "proyecto" && t.estado !== "hecha").length}{" "}
          tareas de proyecto activas ·{" "}
          {formatMin(
            tareas
              .filter((t) => t.tipo === "proyecto" && t.estado !== "hecha")
              .reduce((suma, t) => suma + (t.duracion_estimada_min ?? 0), 0),
          )}{" "}
          estimadas
        </p>
      ) : null}
    </div>
  );
}
