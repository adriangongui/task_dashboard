"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMin, parsearTiempo } from "@/lib/duration";
import type { PlanDia } from "@/lib/plan";
import type { Tarea } from "@/lib/types";

interface Props {
  tareas: Tarea[];
  presupuestoInicial?: number | null;
  onCerrar: () => void;
  onMarcarHecha: (tarea: Tarea) => Promise<void>;
}

type Modo = "sesion" | "cronometro" | "cuenta";

interface Sesion {
  presupuestoMin: number;
  consumidoSeg: number;
  tareaId: string | null;
  tareaTitulo: string | null;
  inicio: number | null;
  acumuladoSeg: number;
  estado: "eligiendo" | "corriendo" | "pausado";
  sugeridas: string[];
  completadas: string[];
}

const CLAVE_SESION = "task-dashboard-enfoque-v1";

const TABS: Array<{ key: Modo; label: string }> = [
  { key: "sesion", label: "Sesión" },
  { key: "cronometro", label: "Cronómetro" },
  { key: "cuenta", label: "Cuenta atrás" },
];

function reloj(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const seg = total % 60;

  if (horas > 0) {
    return `${horas}:${String(minutos).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
  }
  return `${minutos}:${String(seg).padStart(2, "0")}`;
}

function conSigno(segundos: number): string {
  return `${segundos < 0 ? "−" : ""}${reloj(Math.abs(segundos))}`;
}

/** Pitido sencillo al acabar la cuenta atrás. */
function pitido(): void {
  try {
    const Ventana = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = Ventana.AudioContext ?? Ventana.webkitAudioContext;
    if (!Ctx) return;

    const contexto = new Ctx();
    const oscilador = contexto.createOscillator();
    const volumen = contexto.createGain();

    oscilador.type = "sine";
    oscilador.frequency.value = 880;
    oscilador.connect(volumen);
    volumen.connect(contexto.destination);
    volumen.gain.setValueAtTime(0.0001, contexto.currentTime);
    volumen.gain.exponentialRampToValueAtTime(0.22, contexto.currentTime + 0.03);
    volumen.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + 1.4);
    oscilador.start();
    oscilador.stop(contexto.currentTime + 1.5);
    setTimeout(() => void contexto.close(), 2000);
  } catch {
    // Si el navegador bloquea el audio, queda el aviso visual.
  }
}

function FilaTarea({
  tarea,
  etiqueta,
  onEmpezar,
}: {
  tarea: Tarea;
  etiqueta: string;
  onEmpezar: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-white px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-ink">{tarea.titulo}</p>
        <p className="mt-0.5 text-[11.5px] text-muted">
          {etiqueta} ·{" "}
          {tarea.duracion_estimada_min
            ? formatMin(tarea.duracion_estimada_min)
            : "sin estimar"}
        </p>
      </div>
      <button
        type="button"
        onClick={onEmpezar}
        className="shrink-0 rounded-[10px] border border-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink transition hover:border-[#D5D1C7] hover:bg-canvas"
      >
        Empezar
      </button>
    </div>
  );
}

export default function FocusPanel({
  tareas,
  presupuestoInicial,
  onCerrar,
  onMarcarHecha,
}: Props) {
  const [modo, setModo] = useState<Modo>("sesion");
  const [ahora, setAhora] = useState(() => Date.now());

  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [cargada, setCargada] = useState(false);
  const [tiempo, setTiempo] = useState(
    presupuestoInicial && presupuestoInicial > 0
      ? String(presupuestoInicial)
      : "",
  );
  const [cargandoPlan, setCargandoPlan] = useState(false);
  const [errorSesion, setErrorSesion] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [cronoInicio, setCronoInicio] = useState<number | null>(null);
  const [cronoAcum, setCronoAcum] = useState(0);

  const [cuentaMinutos, setCuentaMinutos] = useState("25");
  const [cuentaTotalSeg, setCuentaTotalSeg] = useState(0);
  const [cuentaAcum, setCuentaAcum] = useState(0);
  const [cuentaInicio, setCuentaInicio] = useState<number | null>(null);
  const [cuentaSonada, setCuentaSonada] = useState(false);

  // Recupera la sesión al recargar para que el cronómetro siga donde estaba.
  useEffect(() => {
    try {
      const guardada = window.localStorage.getItem(CLAVE_SESION);
      if (guardada) {
        const datos = JSON.parse(guardada) as Sesion;
        if (
          datos &&
          typeof datos.presupuestoMin === "number" &&
          Array.isArray(datos.sugeridas)
        ) {
          setSesion(datos);
        }
      }
    } catch {
      // Si el borrador está corrupto, se empieza de cero.
    } finally {
      setCargada(true);
    }
  }, []);

  useEffect(() => {
    if (!cargada) return;

    try {
      if (sesion) {
        window.localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
      } else {
        window.localStorage.removeItem(CLAVE_SESION);
      }
    } catch {
      // Sin almacenamiento la sesión solo dura lo que esta pestaña.
    }
  }, [sesion, cargada]);

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

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

  const pendientesHoy = useMemo(
    () => tareas.filter((t) => t.tipo === "hoy" && t.estado === "pendiente"),
    [tareas],
  );

  const tareaActiva = sesion?.tareaId
    ? tareas.find((t) => t.id === sesion.tareaId)
    : undefined;

  const transcurrido = sesion
    ? sesion.acumuladoSeg +
      (sesion.inicio ? Math.max(0, (ahora - sesion.inicio) / 1000) : 0)
    : 0;

  const restante = sesion
    ? sesion.presupuestoMin * 60 - sesion.consumidoSeg - transcurrido
    : 0;

  const sugeridas = useMemo(() => {
    if (!sesion) return [];

    return sesion.sugeridas
      .map((id) => pendientesHoy.find((t) => t.id === id))
      .filter((t): t is Tarea => Boolean(t));
  }, [sesion, pendientesHoy]);

  const otrasHoy = useMemo(() => {
    if (!sesion) return [];
    const ids = new Set(sesion.sugeridas);
    return pendientesHoy.filter((t) => !ids.has(t.id));
  }, [sesion, pendientesHoy]);

  const crono =
    cronoAcum + (cronoInicio ? Math.max(0, (ahora - cronoInicio) / 1000) : 0);

  const transcurridoCuenta =
    cuentaAcum + (cuentaInicio ? Math.max(0, (ahora - cuentaInicio) / 1000) : 0);
  const restanteCuenta = Math.max(0, cuentaTotalSeg - transcurridoCuenta);
  const vistaCuenta =
    cuentaTotalSeg > 0
      ? restanteCuenta
      : Math.max(0, (parsearTiempo(cuentaMinutos) ?? 0) * 60);

  useEffect(() => {
    if (!cuentaInicio) return;
    if (restanteCuenta > 0) return;

    setCuentaAcum(cuentaTotalSeg);
    setCuentaInicio(null);
    setCuentaSonada(true);
    pitido();
  }, [cuentaInicio, restanteCuenta, cuentaTotalSeg]);

  async function iniciarSesion() {
    const minutos = parsearTiempo(tiempo);

    if (!minutos || minutos <= 0) {
      setErrorSesion("Dime cuánto tiempo tienes, por ejemplo “2h 30min” o “90”.");
      return;
    }

    setCargandoPlan(true);
    setErrorSesion(null);

    try {
      const respuesta = await fetch("/api/plan-dia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minutos }),
      });
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos?.error ?? "No se pudo calcular el plan");
      }

      setSesion({
        presupuestoMin: minutos,
        consumidoSeg: 0,
        tareaId: null,
        tareaTitulo: null,
        inicio: null,
        acumuladoSeg: 0,
        estado: "eligiendo",
        sugeridas: (datos as PlanDia).sugeridas,
        completadas: [],
      });
    } catch (e) {
      setErrorSesion(
        e instanceof Error ? e.message : "No se pudo calcular el plan",
      );
    } finally {
      setCargandoPlan(false);
    }
  }

  function empezarTarea(tarea: Tarea) {
    setSesion((actual) =>
      actual
        ? {
            ...actual,
            tareaId: tarea.id,
            tareaTitulo: tarea.titulo,
            inicio: Date.now(),
            acumuladoSeg: 0,
            estado: "corriendo",
          }
        : actual,
    );
    setAhora(Date.now());
  }

  function pausarTarea() {
    setSesion((actual) => {
      if (!actual || !actual.inicio) return actual;

      const segundos = Math.max(0, (Date.now() - actual.inicio) / 1000);
      return {
        ...actual,
        acumuladoSeg: actual.acumuladoSeg + segundos,
        inicio: null,
        estado: "pausado",
      };
    });
  }

  function reanudarTarea() {
    setSesion((actual) =>
      actual
        ? { ...actual, inicio: Date.now(), estado: "corriendo" }
        : actual,
    );
    setAhora(Date.now());
  }

  async function terminarTarea() {
    if (!sesion?.tareaId) return;

    const tarea = tareaActiva;
    if (!tarea) {
      setSesion((actual) =>
        actual
          ? {
              ...actual,
              tareaId: null,
              tareaTitulo: null,
              inicio: null,
              acumuladoSeg: 0,
              estado: "eligiendo",
            }
          : actual,
      );
      setErrorSesion("Esa tarea ya no existe.");
      return;
    }

    // Se calcula con la hora actual, no con el último tick del reloj: así no
    // se pierde tiempo si la pestaña estuvo en segundo plano.
    const segundos = Math.round(
      sesion.acumuladoSeg +
        (sesion.inicio ? Math.max(0, (Date.now() - sesion.inicio) / 1000) : 0),
    );
    setGuardando(true);
    setErrorSesion(null);

    try {
      await onMarcarHecha(tarea);
      setSesion((actual) =>
        actual
          ? {
              ...actual,
              consumidoSeg: actual.consumidoSeg + segundos,
              tareaId: null,
              tareaTitulo: null,
              inicio: null,
              acumuladoSeg: 0,
              estado: "eligiendo",
              completadas: [...actual.completadas, tarea.id],
            }
          : actual,
      );
    } catch {
      setErrorSesion("No se pudo marcar la tarea como hecha.");
    } finally {
      setGuardando(false);
    }
  }

  function descartarTiempo() {
    setSesion((actual) =>
      actual
        ? {
            ...actual,
            tareaId: null,
            tareaTitulo: null,
            inicio: null,
            acumuladoSeg: 0,
            estado: "eligiendo",
          }
        : actual,
    );
  }

  function alternarCrono() {
    if (cronoInicio) {
      setCronoAcum(cronoAcum + (Date.now() - cronoInicio) / 1000);
      setCronoInicio(null);
    } else {
      setCronoInicio(Date.now());
    }
    setAhora(Date.now());
  }

  function reiniciarCrono() {
    setCronoInicio(null);
    setCronoAcum(0);
    setAhora(Date.now());
  }

  function alternarCuenta() {
    if (cuentaInicio) {
      setCuentaAcum(cuentaAcum + (Date.now() - cuentaInicio) / 1000);
      setCuentaInicio(null);
      setAhora(Date.now());
      return;
    }

    const minutos = parsearTiempo(cuentaMinutos);
    if (!minutos || minutos <= 0) {
      setErrorSesion("Escribe los minutos de la cuenta atrás, por ejemplo 25.");
      return;
    }

    if (cuentaTotalSeg === 0) setCuentaTotalSeg(minutos * 60);
    setCuentaSonada(false);
    setCuentaInicio(Date.now());
    setAhora(Date.now());
  }

  function reiniciarCuenta() {
    setCuentaInicio(null);
    setCuentaAcum(0);
    setCuentaTotalSeg(0);
    setCuentaSonada(false);
    setAhora(Date.now());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#23211E]/35 px-3 py-6 backdrop-blur-[2px] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="enfoque-titulo"
        className="relative w-full max-w-[760px] rounded-[22px] border border-line bg-canvas shadow-float"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Enfoque
            </p>
            <h2
              id="enfoque-titulo"
              className="mt-0.5 text-[20px] font-semibold tracking-[-0.01em]"
            >
              Sesión y temporizadores
            </h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar enfoque"
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
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setModo(tab.key)}
              className={[
                "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition",
                modo === tab.key
                  ? "border-transparent bg-white text-ink shadow-card"
                  : "border-transparent bg-white/50 text-muted hover:bg-white",
              ].join(" ")}
              aria-pressed={modo === tab.key}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="px-5 pb-5 pt-4">
          {modo === "sesion" ? (
            !sesion ? (
              <div className="rounded-panel border border-line bg-white p-5">
                <h3 className="text-[15px] font-semibold">
                  ¿Cuánto tiempo tienes?
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  Te propongo las tareas de hoy que caben. Elige una, el
                  cronómetro cuenta lo que tardas y, al marcarla como hecha, ese
                  tiempo se descuenta del total.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={tiempo}
                    onChange={(event) => {
                      setTiempo(event.target.value);
                      if (errorSesion) setErrorSesion(null);
                    }}
                    placeholder="2h 30min"
                    autoComplete="off"
                    aria-label="Tiempo disponible"
                    className="min-w-0 flex-1 rounded-[12px] border border-line bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-hoy/45 placeholder:text-muted/70"
                  />
                  <button
                    type="button"
                    onClick={iniciarSesion}
                    disabled={cargandoPlan}
                    className="rounded-[12px] bg-ink px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#111110] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {cargandoPlan ? "Calculando…" : "Empezar sesión"}
                  </button>
                </div>
                {errorSesion ? (
                  <p className="mt-2 text-[12px] text-sinterminar">
                    {errorSesion}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-end justify-between gap-3 rounded-panel border border-line bg-white p-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                      {sesion.tareaId ? "Te queda" : "Tiempo restante"}
                    </p>
                    <p
                      className={[
                        "mt-0.5 text-[36px] font-semibold leading-none tabular-nums tracking-[-0.03em]",
                        restante < 0 ? "text-sinterminar" : "text-ink",
                      ].join(" ")}
                    >
                      {conSigno(restante)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11.5px] text-muted">
                      de {formatMin(sesion.presupuestoMin)}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {sesion.completadas.length}{" "}
                      {sesion.completadas.length === 1
                        ? "tarea hecha"
                        : "tareas hechas"}
                    </p>
                  </div>
                </div>

                {sesion.tareaId ? (
                  <div className="rounded-panel border border-hoy/30 bg-white p-5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-hoy">
                      Tarea en curso
                    </p>
                    <h3 className="mt-1 text-[17px] font-semibold leading-snug">
                      {sesion.tareaTitulo}
                    </h3>
                    <p className="mt-4 text-[52px] font-semibold leading-none tabular-nums tracking-[-0.04em]">
                      {reloj(transcurrido)}
                    </p>
                    <p className="mt-2 text-[12.5px] text-muted">
                      {sesion.estado === "pausado"
                        ? "En pausa"
                        : "Cronometrando esta tarea"}
                      {restante < 0 ? " · te has pasado del tiempo" : ""}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={
                          sesion.estado === "pausado"
                            ? reanudarTarea
                            : pausarTarea
                        }
                        className="rounded-[11px] border border-line bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink transition hover:bg-canvas"
                      >
                        {sesion.estado === "pausado" ? "Seguir" : "Pausar"}
                      </button>
                      <button
                        type="button"
                        onClick={terminarTarea}
                        disabled={guardando}
                        className="rounded-[11px] bg-ink px-3.5 py-2 text-[12.5px] font-medium text-white transition hover:bg-[#111110] disabled:opacity-60"
                      >
                        {guardando
                          ? "Marcando…"
                          : "Terminar y marcar hecha"}
                      </button>
                      <button
                        type="button"
                        onClick={descartarTiempo}
                        className="rounded-[11px] px-3 py-2 text-[12.5px] font-medium text-muted transition hover:bg-white hover:text-ink"
                      >
                        Descartar tiempo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {sugeridas.length > 0 ? (
                      <>
                        <p className="px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                          Caben en tu tiempo
                        </p>
                        {sugeridas.map((tarea) => (
                          <FilaTarea
                            key={tarea.id}
                            tarea={tarea}
                            etiqueta="Hoy · plan"
                            onEmpezar={() => empezarTarea(tarea)}
                          />
                        ))}
                      </>
                    ) : (
                      <p className="rounded-card border border-dashed border-line px-4 py-5 text-center text-[12.5px] leading-relaxed text-muted">
                        No entra ninguna tarea de hoy en ese tiempo. Puedes
                        empezar por una igualmente.
                      </p>
                    )}

                    {otrasHoy.length > 0 ? (
                      <>
                        <p className="mt-3 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                          Otras tareas de hoy
                        </p>
                        {otrasHoy.map((tarea) => (
                          <FilaTarea
                            key={tarea.id}
                            tarea={tarea}
                            etiqueta="Hoy"
                            onEmpezar={() => empezarTarea(tarea)}
                          />
                        ))}
                      </>
                    ) : null}
                  </div>
                )}

                {errorSesion ? (
                  <p className="px-1 text-[12px] text-sinterminar">
                    {errorSesion}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <p className="text-[11.5px] text-muted">
                    Al marcar una tarea se descuenta el tiempo cronometrado.
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSesion(null)}
                      className="rounded-full px-2.5 py-1 text-[12px] font-medium text-muted transition hover:bg-white hover:text-ink"
                    >
                      Cambiar tiempo
                    </button>
                    <button
                      type="button"
                      onClick={() => setSesion(null)}
                      className="rounded-full px-2.5 py-1 text-[12px] font-medium text-muted transition hover:bg-white hover:text-ink"
                    >
                      Terminar sesión
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : modo === "cronometro" ? (
            <div className="rounded-panel border border-line bg-white px-5 py-8 text-center">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Cronómetro libre
              </p>
              <p className="mt-4 text-[58px] font-semibold leading-none tabular-nums tracking-[-0.04em] sm:text-[68px]">
                {reloj(crono)}
              </p>
              <p className="mt-2 text-[12.5px] text-muted">
                Para estudiar o lo que quieras, sin tarea asociada.
              </p>
              <div className="mt-6 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={alternarCrono}
                  className={[
                    "rounded-[12px] px-4 py-2.5 text-[13px] font-medium text-white transition",
                    cronoInicio
                      ? "bg-[#6C675E] hover:bg-[#5C5850]"
                      : "bg-ink hover:bg-[#111110]",
                  ].join(" ")}
                >
                  {cronoInicio ? "Pausar" : crono > 0 ? "Seguir" : "Empezar"}
                </button>
                <button
                  type="button"
                  onClick={reiniciarCrono}
                  className="rounded-[12px] border border-line bg-white px-4 py-2.5 text-[13px] font-medium text-muted transition hover:border-[#D5D1C7] hover:text-ink"
                >
                  Reiniciar
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-panel border border-line bg-white px-5 py-8 text-center">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Cuenta atrás
              </p>
              <p
                className={[
                  "mt-4 text-[58px] font-semibold leading-none tabular-nums tracking-[-0.04em] sm:text-[68px]",
                  cuentaSonada ? "text-sinterminar" : "text-ink",
                ].join(" ")}
              >
                {reloj(vistaCuenta)}
              </p>
              <p className="mt-2 text-[12.5px] text-muted">
                {cuentaSonada
                  ? "¡Tiempo! Para un rato o vuelve a empezar."
                  : "Elige los minutos y te aviso al llegar a cero."}
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <div className="flex items-center gap-2 rounded-[12px] border border-line bg-canvas/60 px-3 py-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={cuentaMinutos}
                    onChange={(event) => {
                      setCuentaMinutos(event.target.value);
                      if (errorSesion) setErrorSesion(null);
                    }}
                    aria-label="Minutos de la cuenta atrás"
                    className="w-16 bg-transparent text-center text-sm tabular-nums outline-none"
                  />
                  <span className="text-xs text-muted">min</span>
                </div>
                <button
                  type="button"
                  onClick={alternarCuenta}
                  className={[
                    "rounded-[12px] px-4 py-2.5 text-[13px] font-medium text-white transition",
                    cuentaInicio
                      ? "bg-[#6C675E] hover:bg-[#5C5850]"
                      : "bg-ink hover:bg-[#111110]",
                  ].join(" ")}
                >
                  {cuentaInicio
                    ? "Pausar"
                    : cuentaAcum > 0
                      ? "Seguir"
                      : "Empezar"}
                </button>
                <button
                  type="button"
                  onClick={reiniciarCuenta}
                  className="rounded-[12px] border border-line bg-white px-4 py-2.5 text-[13px] font-medium text-muted transition hover:border-[#D5D1C7] hover:text-ink"
                >
                  Reiniciar
                </button>
              </div>

              {errorSesion ? (
                <p className="mt-3 text-[12px] text-sinterminar">
                  {errorSesion}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
