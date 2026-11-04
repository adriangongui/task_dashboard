"use client";

import { useEffect, useState } from "react";
import type { NuevaTarea, Proyecto, Tipo } from "@/lib/types";

interface Props {
  proyectos: Proyecto[];
  onCerrar: () => void;
  onCrear: (datos: NuevaTarea) => Promise<void>;
}

const DESTINOS: Array<{ key: Tipo; label: string; color: string }> = [
  { key: "hoy", label: "Hoy", color: "#5B5DD6" },
  { key: "manana", label: "Mañana", color: "#C08A2E" },
  { key: "semana", label: "Esta semana", color: "#22A06B" },
  { key: "proyecto", label: "Proyecto", color: "#D97757" },
];

export default function NewTaskPanel({
  proyectos,
  onCerrar,
  onCrear,
}: Props) {
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [tipo, setTipo] = useState<Tipo>("hoy");
  const [proyectoId, setProyectoId] = useState("");
  const [duracion, setDuracion] = useState("");
  const [paralelizable, setParalelizable] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function enviar(event: React.FormEvent) {
    event.preventDefault();
    const limpio = titulo.trim();

    if (!limpio) {
      setError("Escribe un título para la tarea.");
      return;
    }

    let minutos: number | null = null;
    if (duracion.trim() !== "") {
      const valor = Number(duracion);
      if (!Number.isFinite(valor) || valor <= 0) {
        setError("La duración debe ser un número de minutos mayor que 0.");
        return;
      }
      minutos = Math.round(valor);
    }

    setError(null);
    setGuardando(true);
    try {
      await onCrear({
        titulo: limpio,
        detalle: detalle.trim(),
        tipo,
        proyecto_id: tipo === "proyecto" && proyectoId ? proyectoId : null,
        duracion_estimada_min: minutos,
        paralelizable,
      });
      onCerrar();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar la tarea.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-stretch lg:justify-end">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 cursor-default bg-[#23211E]/30 backdrop-blur-[2px]"
      />

      <form
        onSubmit={enviar}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nueva-tarea-titulo"
        className="relative flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-[22px] border border-line bg-white px-5 pb-6 pt-5 shadow-float lg:h-full lg:max-h-none lg:w-[468px] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:px-7 lg:py-7"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2
            id="nueva-tarea-titulo"
            className="text-[18px] font-semibold tracking-[-0.015em]"
          >
            Nueva tarea
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-muted transition hover:bg-canvas hover:text-ink"
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

        <label
          htmlFor="nueva-titulo"
          className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
        >
          Título
        </label>
        <input
          id="nueva-titulo"
          value={titulo}
          onChange={(event) => {
            setTitulo(event.target.value);
            if (error) setError(null);
          }}
          placeholder="Llamar al gestor por el contrato"
          maxLength={120}
          autoFocus
          autoComplete="off"
          className="rounded-[12px] border border-line bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-muted/70 focus:border-hoy/45"
        />

        <label
          htmlFor="nueva-detalle"
          className="mb-1.5 mt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
        >
          Detalle <span className="normal-case tracking-normal">(opcional)</span>
        </label>
        <textarea
          id="nueva-detalle"
          value={detalle}
          onChange={(event) => setDetalle(event.target.value)}
          rows={4}
          placeholder="Contexto, pasos, teléfono, enlaces…"
          className="resize-none rounded-[12px] border border-line bg-white px-3 py-2.5 text-sm leading-relaxed outline-none transition placeholder:text-muted/70 focus:border-hoy/45"
        />

        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Dónde va
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {DESTINOS.map((destino) => {
              const activo = tipo === destino.key;
              return (
                <button
                  key={destino.key}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setTipo(destino.key)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium transition",
                    activo
                      ? "border-transparent text-ink shadow-card"
                      : "border-line bg-white text-muted hover:bg-canvas",
                  ].join(" ")}
                  style={
                    activo
                      ? { backgroundColor: `${destino.color}14` }
                      : undefined
                  }
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: destino.color }}
                  />
                  {destino.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {tipo === "proyecto" ? (
          <div className="mt-4">
            <label
              htmlFor="nueva-proyecto"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
            >
              Proyecto
            </label>
            <select
              id="nueva-proyecto"
              value={proyectoId}
              onChange={(event) => setProyectoId(event.target.value)}
              className="w-full rounded-[12px] border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-hoy/45"
            >
              <option value="">Sin proyecto</option>
              {proyectos.map((proyecto) => (
                <option key={proyecto.id} value={proyecto.id}>
                  {proyecto.nombre}
                </option>
              ))}
            </select>
            {proyectos.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted">
                Todavía no hay proyectos: se guardará en «Sin proyecto».
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="nueva-duracion"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
            >
              Duración
            </label>
            <div className="flex items-center gap-2 rounded-[12px] border border-line bg-white px-3 py-2.5 focus-within:border-hoy/45">
              <input
                id="nueva-duracion"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={duracion}
                onChange={(event) => setDuracion(event.target.value)}
                placeholder="min"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted/70"
              />
              <span className="shrink-0 text-xs text-muted">min</span>
            </div>
          </div>

          <label className="flex cursor-pointer flex-col justify-end">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              En paralelo
            </span>
            <span className="flex items-center gap-2 rounded-[12px] border border-line px-3 py-[9px] text-[13px] transition hover:bg-canvas">
              <input
                type="checkbox"
                checked={paralelizable}
                onChange={(event) => setParalelizable(event.target.checked)}
                className="h-4 w-4 accent-[#5B5DD6]"
              />
              ⇄ compatible
            </span>
          </label>
        </div>

        {error ? (
          <p className="mt-3 text-[12.5px] text-sinterminar">{error}</p>
        ) : null}

        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-[12px] border border-line px-4 py-2.5 text-[13.5px] font-medium text-muted transition hover:bg-canvas hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="flex-1 rounded-[12px] bg-ink px-4 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[#111110] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Añadir tarea"}
          </button>
        </div>
      </form>
    </div>
  );
}
