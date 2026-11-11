"use client";

import { useEffect, useState } from "react";
import { formatMin } from "@/lib/duration";
import type { Proyecto, Tarea } from "@/lib/types";

interface Props {
  proyecto: Proyecto;
  tareas: Tarea[];
  onCerrar: () => void;
  onGuardarNombre: (proyecto: Proyecto, nombre: string) => Promise<void>;
  onEliminar: (proyecto: Proyecto) => Promise<void>;
}

const ETIQUETA_TIPO: Record<Tarea["tipo"], string> = {
  hoy: "Hoy",
  manana: "Mañana",
  semana: "Esta semana",
  programada: "Programada",
  proyecto: "Proyecto",
};

export default function ProjectDetailPanel({
  proyecto,
  tareas,
  onCerrar,
  onGuardarNombre,
  onEliminar,
}: Props) {
  const [nombre, setNombre] = useState(proyecto.nombre);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
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

  const pendientes = tareas.filter((t) => t.estado === "pendiente");
  const hechas = tareas.filter((t) => t.estado === "hecha").length;
  const total = tareas.length;
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;
  const minutosPendientes = pendientes.reduce(
    (suma, t) => suma + (t.duracion_estimada_min ?? 0),
    0,
  );

  async function guardarNombre() {
    const limpio = nombre.trim();
    if (!limpio) {
      setAviso("El nombre no puede estar vacío.");
      return;
    }
    if (limpio === proyecto.nombre) return;

    setGuardando(true);
    setAviso(null);
    try {
      await onGuardarNombre(proyecto, limpio);
      setAviso("Nombre guardado");
    } catch {
      setAviso("No se pudo guardar el nombre.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    setEliminando(true);
    setAviso(null);
    try {
      await onEliminar(proyecto);
    } catch {
      setAviso("No se pudo eliminar el proyecto.");
      setEliminando(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-stretch lg:justify-end">
      <button
        type="button"
        aria-label="Cerrar detalle del proyecto"
        onClick={onCerrar}
        className="absolute inset-0 cursor-default bg-[#23211E]/30 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalle-proyecto"
        className="relative flex max-h-[88vh] w-full flex-col overflow-y-auto rounded-t-[22px] border border-line bg-white px-5 pb-6 pt-5 shadow-float lg:max-h-none lg:h-full lg:w-[468px] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:px-7 lg:py-7"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: proyecto.color }}
            />
            Proyecto
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

        <input
          id="detalle-proyecto"
          value={nombre}
          onChange={(event) => {
            setNombre(event.target.value);
            if (aviso) setAviso(null);
          }}
          aria-label="Nombre del proyecto"
          className="w-full rounded-[10px] border border-transparent bg-transparent px-0 py-0.5 text-[20px] font-semibold leading-snug tracking-[-0.015em] outline-none transition hover:border-line focus:border-hoy/45 focus:bg-white focus:px-2 focus:py-1.5"
        />

        {nombre.trim() !== proyecto.nombre ? (
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={guardarNombre}
              disabled={guardando}
              className="rounded-[11px] bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-[#111110] disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Guardar nombre"}
            </button>
            <button
              type="button"
              onClick={() => {
                setNombre(proyecto.nombre);
                setAviso(null);
              }}
              className="rounded-[11px] border border-line bg-white px-3 py-2 text-[12.5px] font-medium text-muted transition hover:border-[#D5D1C7] hover:text-ink"
            >
              Descartar
            </button>
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { etiqueta: "Pendientes", valor: String(pendientes.length) },
            { etiqueta: "Hechas", valor: `${hechas}/${total}` },
            {
              etiqueta: "Tiempo",
              valor: minutosPendientes > 0 ? formatMin(minutosPendientes) : "—",
            },
          ].map((dato) => (
            <div
              key={dato.etiqueta}
              className="rounded-card border border-line bg-canvas/60 px-3 py-2.5"
            >
              <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
                {dato.etiqueta}
              </p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums">
                {dato.valor}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[#EFEDE7]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%`, backgroundColor: proyecto.color }}
          />
        </div>

        <div className="mt-6">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Tareas pendientes ({pendientes.length})
          </p>

          {pendientes.length === 0 ? (
            <div className="rounded-card border border-dashed border-line px-3.5 py-4 text-center text-[13px] text-muted">
              Nada pendiente en este proyecto 🎉
            </div>
          ) : (
            <ul className="overflow-hidden rounded-card border border-line">
              {pendientes.map((tarea, indice) => (
                <li
                  key={tarea.id}
                  className={[
                    "flex items-start justify-between gap-3 px-3.5 py-2.5",
                    indice > 0 ? "border-t border-line" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p className="break-words text-[13.5px] leading-snug">
                      {tarea.titulo}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {ETIQUETA_TIPO[tarea.tipo] ?? tarea.tipo}
                    </p>
                  </div>
                  {tarea.duracion_estimada_min ? (
                    <span className="shrink-0 rounded-full bg-[#F2F0EA] px-2 py-[3px] text-[11px] font-medium text-[#6C675E]">
                      {formatMin(tarea.duracion_estimada_min)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {aviso ? <p className="mt-3 text-xs text-muted">{aviso}</p> : null}

        <div className="mt-6 border-t border-line pt-4">
          {confirmando ? (
            <div>
              <p className="text-[12.5px] leading-relaxed text-muted">
                ¿Eliminar «{proyecto.nombre}»? Las tareas no se borran: pasan a
                «Sin proyecto».
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={eliminar}
                  disabled={eliminando}
                  className="rounded-[11px] bg-sinterminar px-3 py-2 text-[12.5px] font-medium text-white transition hover:bg-[#BD426B] disabled:opacity-60"
                >
                  {eliminando ? "Eliminando…" : "Sí, eliminar proyecto"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  disabled={eliminando}
                  className="rounded-[11px] border border-line bg-white px-3 py-2 text-[12.5px] font-medium text-muted transition hover:border-[#D5D1C7] hover:text-ink disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="inline-flex items-center gap-1.5 rounded-[11px] border border-sinterminar/30 bg-white px-3 py-2 text-[12.5px] font-medium text-sinterminar transition hover:bg-sinterminar/[0.06]"
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
              Eliminar proyecto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
