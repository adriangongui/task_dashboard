"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDias, hoyISO } from "@/lib/dates";
import {
  CATEGORIAS_EVENTO,
  LISTA_CATEGORIAS,
  type CategoriaEvento,
  type Evento,
} from "@/lib/eventos";
import { fechaCorta, fechaLargaDia } from "@/lib/fechas";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const NOMBRES_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

interface Borrador {
  id: string | null;
  titulo: string;
  detalle: string;
  categoria: CategoriaEvento;
  fecha: string;
  hora: string;
}

function primerDia(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function desplazamientoLunes(fecha: string): number {
  return (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function mesDe(fecha: string): { anio: number; mes: number } {
  const [anio, mes] = fecha.split("-").map(Number);
  return { anio, mes };
}

function sumarMes(anio: number, mes: number, delta: number): {
  anio: number;
  mes: number;
} {
  const indice = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(indice / 12), mes: (indice % 12) + 1 };
}

function borradorVacio(fecha: string): Borrador {
  return {
    id: null,
    titulo: "",
    detalle: "",
    categoria: "otro",
    fecha,
    hora: "",
  };
}

export default function CalendarPanel({ onCerrar }: { onCerrar: () => void }) {
  const hoy = hoyISO();
  const [vista, setVista] = useState(() => mesDe(hoy));
  const [seleccion, setSeleccion] = useState(hoy);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/eventos", { cache: "no-store" });
      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(cuerpo?.error ?? "No se pudo cargar el calendario");
      }

      setEventos((cuerpo.eventos ?? []) as Evento[]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cargar el calendario",
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
      if (event.key === "Escape") {
        if (borrador) {
          setBorrador(null);
          setConfirmandoBorrado(false);
        } else {
          onCerrar();
        }
      }
    }

    document.addEventListener("keydown", alPulsar);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", alPulsar);
      document.body.style.overflow = overflowPrevio;
    };
  }, [borrador, onCerrar]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>();
    for (const evento of eventos) {
      const lista = mapa.get(evento.fecha) ?? [];
      lista.push(evento);
      mapa.set(evento.fecha, lista);
    }
    return mapa;
  }, [eventos]);

  const inicio = primerDia(vista.anio, vista.mes);
  const totalDias = diasDelMes(vista.anio, vista.mes);
  const huecos = desplazamientoLunes(inicio);
  const celdas: Array<string | null> = [
    ...Array.from({ length: huecos }, () => null),
    ...Array.from({ length: totalDias }, (_, indice) =>
      primerDia(vista.anio, vista.mes).replace(
        /-01$/,
        `-${String(indice + 1).padStart(2, "0")}`,
      ),
    ),
  ];

  const eventosSeleccion = porDia.get(seleccion) ?? [];

  const eventosMes = eventos.filter((evento) => {
    const { anio, mes } = mesDe(evento.fecha);
    return anio === vista.anio && mes === vista.mes;
  });

  function cambiarMes(delta: number) {
    const siguiente = sumarMes(vista.anio, vista.mes, delta);
    setVista(siguiente);
    setSeleccion(primerDia(siguiente.anio, siguiente.mes));
    setBorrador(null);
    setConfirmandoBorrado(false);
  }

  function irHoy() {
    const actual = mesDe(hoy);
    setVista(actual);
    setSeleccion(hoy);
    setBorrador(null);
  }

  function abrirNuevo(fecha = seleccion) {
    setSeleccion(fecha);
    setBorrador(borradorVacio(fecha));
    setConfirmandoBorrado(false);
  }

  function abrirEvento(evento: Evento) {
    setSeleccion(evento.fecha);
    setBorrador({
      id: evento.id,
      titulo: evento.titulo,
      detalle: evento.detalle,
      categoria: evento.categoria,
      fecha: evento.fecha,
      hora: evento.hora ?? "",
    });
    setConfirmandoBorrado(false);
  }

  async function guardar(event: React.FormEvent) {
    event.preventDefault();
    if (!borrador) return;

    const titulo = borrador.titulo.trim();
    if (!titulo) {
      setError("Ponle un título al evento.");
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/eventos", {
        method: borrador.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(borrador.id ? { id: borrador.id } : {}),
          titulo,
          detalle: borrador.detalle.trim(),
          categoria: borrador.categoria,
          fecha: borrador.fecha,
          hora: borrador.hora.trim() || null,
        }),
      });
      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(cuerpo?.error ?? "No se pudo guardar el evento");
      }

      const guardado = cuerpo.evento as Evento;
      setEventos((prev) =>
        borrador.id
          ? prev.map((evento) => (evento.id === guardado.id ? guardado : evento))
          : [...prev, guardado],
      );
      setSeleccion(guardado.fecha);
      setBorrador(null);
      setConfirmandoBorrado(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el evento");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!borrador?.id) return;

    setGuardando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/eventos", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: borrador.id }),
      });
      const cuerpo = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(cuerpo?.error ?? "No se pudo borrar el evento");
      }

      setEventos((prev) => prev.filter((evento) => evento.id !== borrador.id));
      setBorrador(null);
      setConfirmandoBorrado(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar el evento");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto w-full max-w-[1320px] px-3 pb-16 pt-4 sm:px-6 sm:pt-6">
        <header className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Calendario
            </p>
            <h1 className="mt-0.5 text-[24px] font-semibold capitalize tracking-[-0.02em] sm:text-[30px]">
              {NOMBRES_MES[vista.mes - 1]} {vista.anio}
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => cambiarMes(-1)}
              aria-label="Mes anterior"
              className="rounded-full border border-line bg-white p-2 text-muted transition hover:text-ink"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5 7 10l5 5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={irHoy}
              className="rounded-full border border-line bg-white px-3 py-2 text-[12.5px] font-medium text-muted transition hover:text-ink"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => cambiarMes(1)}
              aria-label="Mes siguiente"
              className="rounded-full border border-line bg-white p-2 text-muted transition hover:text-ink"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m8 5 5 5-5 5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar calendario"
              className="ml-1 rounded-full border border-line bg-white p-2 text-muted transition hover:text-ink"
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
        </header>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-muted">
          <span>{eventosMes.length} eventos este mes</span>
          <span aria-hidden="true">·</span>
          <div className="flex flex-wrap items-center gap-2">
            {LISTA_CATEGORIAS.map((categoria) => (
              <span key={categoria} className="inline-flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: CATEGORIAS_EVENTO[categoria].color }}
                />
                {CATEGORIAS_EVENTO[categoria].etiqueta}
              </span>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-card border border-sinterminar/30 bg-sinterminar/[0.05] px-3.5 py-2.5 text-[12.5px] text-[#A63C60]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section
            aria-label="Mes"
            className="overflow-hidden rounded-panel border border-line bg-white shadow-card"
          >
            <div className="grid grid-cols-7 border-b border-line bg-canvas/60">
              {DIAS.map((dia) => (
                <div
                  key={dia}
                  className="px-1 py-2 text-center text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted"
                >
                  {dia}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {celdas.map((fecha, indice) => {
                if (!fecha) {
                  return (
                    <div
                      key={`hueco-${indice}`}
                      className="min-h-[74px] border-b border-r border-line/70 bg-canvas/30 last:border-r-0 sm:min-h-[104px]"
                    />
                  );
                }

                const lista = porDia.get(fecha) ?? [];
                const esHoy = fecha === hoy;
                const activo = fecha === seleccion;

                return (
                  <button
                    key={fecha}
                    type="button"
                    onClick={() => {
                      setSeleccion(fecha);
                      setBorrador(null);
                      setConfirmandoBorrado(false);
                    }}
                    onDoubleClick={() => abrirNuevo(fecha)}
                    aria-label={`${fechaLargaDia(fecha)}, ${lista.length} eventos`}
                    aria-pressed={activo}
                    className={[
                      "relative min-h-[74px] border-b border-r border-line/70 p-1.5 text-left align-top transition last:border-r-0 sm:min-h-[104px] sm:p-2",
                      activo
                        ? "bg-hoy/[0.06] ring-1 ring-inset ring-hoy/40"
                        : "hover:bg-canvas/60",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11.5px] tabular-nums",
                        esHoy
                          ? "bg-ink font-semibold text-white"
                          : "text-[#5F5A52]",
                      ].join(" ")}
                    >
                      {Number(fecha.slice(8))}
                    </span>

                    <div className="mt-1 hidden flex-col gap-[3px] sm:flex">
                      {lista.slice(0, 2).map((evento) => (
                        <span
                          key={evento.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            abrirEvento(evento);
                          }}
                          className="block truncate rounded-[5px] px-1.5 py-[2px] text-[10.5px] font-medium leading-tight"
                          style={{
                            backgroundColor: `${CATEGORIAS_EVENTO[evento.categoria].color}16`,
                            color: CATEGORIAS_EVENTO[evento.categoria].color,
                          }}
                          title={`${evento.titulo}${evento.hora ? ` · ${evento.hora}` : ""}`}
                        >
                          {evento.hora ? `${evento.hora} ` : ""}
                          {evento.titulo}
                        </span>
                      ))}
                      {lista.length > 2 ? (
                        <span className="pl-1 text-[10px] text-muted">
                          +{lista.length - 2} más
                        </span>
                      ) : null}
                    </div>

                    {lista.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-[3px] sm:hidden">
                        {lista.slice(0, 4).map((evento) => (
                          <span
                            key={evento.id}
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                CATEGORIAS_EVENTO[evento.categoria].color,
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="rounded-panel border border-line bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                  Día elegido
                </p>
                <h2 className="mt-0.5 text-[16px] font-semibold leading-snug">
                  {fechaLargaDia(seleccion)}
                </h2>
              </div>
              {!borrador ? (
                <button
                  type="button"
                  onClick={() => abrirNuevo()}
                  className="shrink-0 rounded-[10px] bg-ink px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#111110]"
                >
                  + Añadir
                </button>
              ) : null}
            </div>

            {cargando ? (
              <div className="mt-4 space-y-2">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-card border border-line bg-canvas/60"
                  />
                ))}
              </div>
            ) : borrador ? (
              <form onSubmit={guardar} className="mt-4">
                <label
                  htmlFor="evento-titulo"
                  className="mb-1 block text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted"
                >
                  Título
                </label>
                <input
                  id="evento-titulo"
                  value={borrador.titulo}
                  onChange={(event) =>
                    setBorrador({ ...borrador, titulo: event.target.value })
                  }
                  placeholder="Examen de cálculo"
                  maxLength={120}
                  autoFocus
                  autoComplete="off"
                  className="w-full rounded-[10px] border border-line bg-white px-2.5 py-2 text-[13px] outline-none transition focus:border-hoy/45"
                />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="evento-fecha"
                      className="mb-1 block text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted"
                    >
                      Fecha
                    </label>
                    <input
                      id="evento-fecha"
                      type="date"
                      value={borrador.fecha}
                      onChange={(event) =>
                        setBorrador({ ...borrador, fecha: event.target.value })
                      }
                      className="w-full rounded-[10px] border border-line bg-white px-2 py-1.5 text-[12.5px] outline-none focus:border-hoy/45"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="evento-hora"
                      className="mb-1 block text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted"
                    >
                      Hora
                    </label>
                    <input
                      id="evento-hora"
                      type="time"
                      value={borrador.hora}
                      onChange={(event) =>
                        setBorrador({ ...borrador, hora: event.target.value })
                      }
                      className="w-full rounded-[10px] border border-line bg-white px-2 py-1.5 text-[12.5px] outline-none focus:border-hoy/45"
                    />
                  </div>
                </div>

                <label
                  htmlFor="evento-categoria"
                  className="mb-1 mt-3 block text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted"
                >
                  Tipo
                </label>
                <select
                  id="evento-categoria"
                  value={borrador.categoria}
                  onChange={(event) =>
                    setBorrador({
                      ...borrador,
                      categoria: event.target.value as CategoriaEvento,
                    })
                  }
                  className="w-full rounded-[10px] border border-line bg-white px-2.5 py-2 text-[12.5px] outline-none focus:border-hoy/45"
                >
                  {LISTA_CATEGORIAS.map((categoria) => (
                    <option key={categoria} value={categoria}>
                      {CATEGORIAS_EVENTO[categoria].etiqueta}
                    </option>
                  ))}
                </select>

                <label
                  htmlFor="evento-detalle"
                  className="mb-1 mt-3 block text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted"
                >
                  Detalle
                </label>
                <textarea
                  id="evento-detalle"
                  value={borrador.detalle}
                  onChange={(event) =>
                    setBorrador({ ...borrador, detalle: event.target.value })
                  }
                  rows={2}
                  placeholder="Aula, asignatura, lugar…"
                  className="w-full resize-none rounded-[10px] border border-line bg-white px-2.5 py-2 text-[12.5px] leading-relaxed outline-none focus:border-hoy/45"
                />

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <button
                    type="submit"
                    disabled={guardando}
                    className="rounded-[10px] bg-ink px-3.5 py-2 text-[12.5px] font-medium text-white transition hover:bg-[#111110] disabled:opacity-60"
                  >
                    {guardando
                      ? "Guardando…"
                      : borrador.id
                        ? "Guardar"
                        : "Añadir al calendario"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBorrador(null);
                      setConfirmandoBorrado(false);
                    }}
                    className="rounded-[10px] border border-line px-3 py-2 text-[12.5px] font-medium text-muted transition hover:text-ink"
                  >
                    Cancelar
                  </button>

                  {borrador.id ? (
                    confirmandoBorrado ? (
                      <span className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void borrar()}
                          disabled={guardando}
                          className="rounded-[9px] bg-sinterminar px-2.5 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60"
                        >
                          Sí, borrar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmandoBorrado(false)}
                          className="rounded-[9px] border border-line px-2 py-1.5 text-[11.5px] font-medium text-muted"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmandoBorrado(true)}
                        className="ml-auto rounded-[9px] px-2 py-1.5 text-[11.5px] font-medium text-sinterminar transition hover:bg-sinterminar/5"
                      >
                        Borrar
                      </button>
                    )
                  ) : null}
                </div>
              </form>
            ) : eventosSeleccion.length === 0 ? (
              <div className="mt-4 rounded-card border border-dashed border-line px-4 py-8 text-center">
                <p className="text-[13px] font-medium text-ink">Día libre</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  Añade un examen, una entrega o una cita. También puedes
                  pedírselo al bot: «el 8 de diciembre tengo un examen».
                </p>
                <button
                  type="button"
                  onClick={() => abrirNuevo()}
                  className="mt-3 rounded-[10px] border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-ink transition hover:bg-canvas"
                >
                  Añadir algo este día
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {eventosSeleccion.map((evento) => {
                  const color = CATEGORIAS_EVENTO[evento.categoria].color;
                  return (
                    <button
                      key={evento.id}
                      type="button"
                      onClick={() => abrirEvento(evento)}
                      className="w-full rounded-card border border-line bg-white px-3 py-2.5 text-left transition hover:border-[#D9D6CD] hover:shadow-card"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium leading-snug text-ink">
                            {evento.titulo}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-muted">
                            {evento.hora ? `${evento.hora} · ` : "Todo el día · "}
                            {CATEGORIAS_EVENTO[evento.categoria].etiqueta}
                          </p>
                          {evento.detalle ? (
                            <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-[#6C675E]">
                              {evento.detalle}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
              Los eventos también se crean por Telegram. Prueba: «el 8 de
              diciembre tengo un examen de cálculo» o «apunta la entrega del
              proyecto el 20/12 a las 10:00».
            </p>
          </aside>
        </div>

        <p className="mt-4 text-[11.5px] text-muted">
          Doble clic en un día para añadir algo. Hoy es {fechaCorta(hoy)}.
        </p>
      </div>
    </div>
  );
}
