"use client";

import { useState } from "react";
import { parsearTiempo } from "@/lib/duration";

interface Props {
  saludo: string;
  fecha: string;
  pendientesHoy: number;
  proponiendo: boolean;
  onProponerPlan: (minutos: number) => void;
  onNuevaTarea: () => void;
}

export default function AppHeader({
  saludo,
  fecha,
  pendientesHoy,
  proponiendo,
  onProponerPlan,
  onNuevaTarea,
}: Props) {
  const [tiempo, setTiempo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function enviar(event: React.FormEvent) {
    event.preventDefault();
    const minutos = parsearTiempo(tiempo);
    if (!minutos) {
      setError("No entiendo ese tiempo. Prueba con “2h 30min” o “90”.");
      return;
    }
    setError(null);
    onProponerPlan(minutos);
  }

  return (
    <header className="rounded-panel border border-line bg-white px-5 py-5 shadow-card sm:px-6 sm:py-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            {fecha || "\u00A0"}
          </p>
          <h1 className="mt-1.5 text-[25px] font-semibold leading-tight tracking-[-0.02em] sm:text-[28px]">
            {saludo || "Hola"}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {pendientesHoy > 0
              ? `${pendientesHoy} ${pendientesHoy === 1 ? "tarea" : "tareas"} pendientes para hoy.`
              : "No tienes nada pendiente para hoy."}
          </p>

          <button
            type="button"
            onClick={onNuevaTarea}
            className="mt-4 inline-flex items-center gap-1.5 rounded-[11px] bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-[#111110]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M10 4.5v11M4.5 10h11" />
            </svg>
            Nueva tarea
          </button>
        </div>

        <form onSubmit={enviar} className="w-full lg:w-[380px]">
          <label
            htmlFor="tiempo-disponible"
            className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
          >
            Tiempo disponible
          </label>
          <div className="flex items-center gap-1 rounded-[13px] border border-line bg-canvas/70 p-1 pl-3 transition focus-within:border-hoy/45 focus-within:bg-white">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="8.25" />
              <path d="M12 7.75V12l3 1.75" />
            </svg>
            <input
              id="tiempo-disponible"
              value={tiempo}
              onChange={(event) => {
                setTiempo(event.target.value);
                if (error) setError(null);
              }}
              placeholder="2h 30min"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted/70"
            />
            <button
              type="submit"
              disabled={proponiendo}
              className="shrink-0 rounded-[10px] bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-[#111110] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {proponiendo ? "Calculando…" : "Proponer plan"}
            </button>
          </div>
          {error ? (
            <p className="mt-1.5 text-xs text-sinterminar">{error}</p>
          ) : null}
        </form>
      </div>
    </header>
  );
}
