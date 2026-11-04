"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDias,
  calcRacha,
  completadaHoy,
  fechaLarga,
  hoyISO,
  horaLocal,
  mananaISO,
  saludo,
} from "@/lib/dates";
import { formatMin } from "@/lib/duration";
import type { PlanDia } from "@/lib/plan";
import type { NuevaTarea, Proyecto, Tarea } from "@/lib/types";
import { insforgeBrowser, insforgeConfigurado } from "@/lib/insforge/client";
import AppHeader from "./AppHeader";
import HechasPanel from "./HechasPanel";
import ProjectsColumn from "./ProjectsColumn";
import StatsRow from "./StatsRow";
import TaskCard from "./TaskCard";
import TaskDetailPanel from "./TaskDetailPanel";
import NewTaskPanel from "./NewTaskPanel";

type TabKey = "hoy" | "manana" | "semana" | "proyectos" | "sin_terminar";
type DestinoArrastre = "hoy" | "manana" | "semana" | "sin_terminar";

interface Armado {
  id: string;
  titulo: string;
  tipo: string;
  startX: number;
  startY: number;
  activo: boolean;
  timer: number | null;
}

const SECCIONES: Array<{
  key: TabKey;
  titulo: string;
  corto: string;
  color: string;
  vacio: string;
}> = [
  {
    key: "hoy",
    titulo: "Hoy",
    corto: "Hoy",
    color: "#5B5DD6",
    vacio: "Nada para hoy. Manda una tarea por Telegram cuando surja.",
  },
  {
    key: "manana",
    titulo: "Mañana",
    corto: "Mañana",
    color: "#C08A2E",
    vacio: "Nada para mañana: arrastra una tarea aquí o créala con destino Mañana.",
  },
  {
    key: "semana",
    titulo: "Esta semana",
    corto: "Semana",
    color: "#22A06B",
    vacio: "Sin tareas de la semana por ahora.",
  },
  {
    key: "proyectos",
    titulo: "Proyectos futuros",
    corto: "Proyectos",
    color: "#D97757",
    vacio: "Aún no hay proyectos.",
  },
  {
    key: "sin_terminar",
    titulo: "Sin terminar",
    corto: "Sin terminar",
    color: "#D6517D",
    vacio: "Todo al día: no quedaron tareas sin terminar.",
  },
];

const NOMBRE_DESTINO: Record<DestinoArrastre, string> = {
  hoy: "Hoy",
  manana: "Mañana",
  semana: "Esta semana",
  sin_terminar: "Sin terminar",
};

export default function Dashboard() {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("hoy");
  const [abierta, setAbierta] = useState<Tarea | null>(null);
  const [plan, setPlan] = useState<PlanDia | null>(null);
  const [proponiendo, setProponiendo] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [creando, setCreando] = useState(false);
  const [hechasAbiertas, setHechasAbiertas] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<{ titulo: string; x: number; y: number } | null>(
    null,
  );
  const [zonaActiva, setZonaActiva] = useState<string | null>(null);
  const [encabezado, setEncabezado] = useState<{ saludo: string; fecha: string }>({
    saludo: "",
    fecha: "",
  });

  const armado = useRef<Armado | null>(null);
  const clickSuprimido = useRef(false);

  useEffect(() => {
    const ahora = new Date();
    setEncabezado({
      saludo: `${saludo(horaLocal(ahora))}`,
      fecha: fechaLarga(ahora),
    });
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), 3800);
    return () => clearTimeout(id);
  }, [aviso]);

  const cargar = useCallback(async () => {
    try {
      setError(null);
      const db = insforgeBrowser().database;
      const [resTareas, resProyectos] = await Promise.all([
        db.from("tareas").select("*").order("created_at", { ascending: false }),
        db.from("proyectos").select("*").order("created_at", { ascending: true }),
      ]);
      if (resTareas.error) throw resTareas.error;
      if (resProyectos.error) throw resProyectos.error;
      setTareas((resTareas.data ?? []) as Tarea[]);
      setProyectos((resProyectos.data ?? []) as Proyecto[]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar los datos de InsForge.",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!insforgeConfigurado()) {
      setCargando(false);
      setError(
        "Faltan NEXT_PUBLIC_INSFORGE_URL o NEXT_PUBLIC_INSFORGE_ANON_KEY. Crea un .env.local con tus claves de InsForge y reinicia el servidor.",
      );
      return;
    }
    void cargar();
  }, [cargar]);

  const actualizarTarea = useCallback(
    async (id: string, cambios: Partial<Tarea>) => {
      const { data, error: errorUpdate } = await insforgeBrowser()
        .database.from("tareas")
        .update(cambios as Record<string, unknown>)
        .eq("id", id)
        .select("*")
        .single();
      if (errorUpdate) throw errorUpdate;
      const actualizada = data as Tarea;
      setTareas((prev) => prev.map((t) => (t.id === id ? actualizada : t)));
      setAbierta((prev) => (prev && prev.id === id ? actualizada : prev));
      return actualizada;
    },
    [],
  );

  const alternarHecha = useCallback(
    async (tarea: Tarea) => {
      const volverAPendiente = tarea.estado === "hecha";
      try {
        await actualizarTarea(
          tarea.id,
          volverAPendiente
            ? { estado: "pendiente", completed_at: null }
            : { estado: "hecha", completed_at: new Date().toISOString() },
        );
        if (!volverAPendiente) {
          setPlan((prev) =>
            prev
              ? {
                  ...prev,
                  sugeridas: prev.sugeridas.filter((id) => id !== tarea.id),
                }
              : prev,
          );
        }
      } catch (e) {
        setAviso(
          e instanceof Error ? `No se pudo actualizar: ${e.message}` : "No se pudo actualizar la tarea",
        );
      }
    },
    [actualizarTarea],
  );

  const moverTarea = useCallback(
    async (id: string, destino: string) => {
      try {
        if (destino === "sin_terminar") {
          await actualizarTarea(id, { estado: "sin_terminar" });
          setAviso("Movida a Sin terminar");
          return;
        }

        if (destino.startsWith("proyecto:")) {
          const proyectoId = destino.slice("proyecto:".length);
          await actualizarTarea(id, {
            tipo: "proyecto",
            estado: "pendiente",
            proyecto_id: proyectoId,
            fecha_para: null,
          });
          setExpandidos((prev) => new Set(prev).add(proyectoId));
          setTab("proyectos");
          setAviso("Movida a ese proyecto");
          return;
        }

        if (destino === "hoy" || destino === "manana" || destino === "semana") {
          await actualizarTarea(id, {
            tipo: destino,
            estado: "pendiente",
            fecha_para:
              destino === "hoy"
                ? hoyISO()
                : destino === "manana"
                  ? mananaISO()
                  : null,
          });
          setAviso(`Movida a ${NOMBRE_DESTINO[destino]}`);
        }
      } catch (e) {
        setAviso(
          e instanceof Error ? `No se pudo mover: ${e.message}` : "No se pudo mover la tarea",
        );
      }
    },
    [actualizarTarea],
  );

  const limpiarArmado = useCallback(() => {
    if (armado.current?.timer) window.clearTimeout(armado.current.timer);
    armado.current = null;
  }, []);

  const activarArrastre = useCallback(() => {
    const actual = armado.current;
    if (!actual || actual.activo) return;
    actual.activo = true;
    if (actual.timer) {
      window.clearTimeout(actual.timer);
      actual.timer = null;
    }
    setArrastre({ titulo: actual.titulo, x: actual.startX, y: actual.startY });
  }, []);

  const agarrarTarea = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, tarea: Tarea) => {
      if (event.button !== 0) return;
      if (
        (event.target as HTMLElement).closest(
          "button, a, input, select, textarea",
        )
      ) {
        return;
      }

      limpiarArmado();

      const base: Armado = {
        id: tarea.id,
        titulo: tarea.titulo,
        tipo: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        activo: false,
        timer: null,
      };

      // En pantalla táctil hace falta mantener pulsado para no bloquear el scroll.
      if (event.pointerType !== "mouse") {
        base.timer = window.setTimeout(activarArrastre, 320);
      }

      armado.current = base;
    },
    [activarArrastre, limpiarArmado],
  );

  useEffect(() => {
    function destinoEn(x: number, y: number): string | null {
      const elemento = document.elementFromPoint(x, y);
      const zona = elemento?.closest("[data-destino]");
      return zona?.getAttribute("data-destino") ?? null;
    }

    function alMover(event: PointerEvent) {
      const actual = armado.current;
      if (!actual) return;

      if (!actual.activo) {
        const distancia = Math.hypot(
          event.clientX - actual.startX,
          event.clientY - actual.startY,
        );
        if (actual.tipo === "mouse") {
          if (distancia > 4) activarArrastre();
        } else if (distancia > 10) {
          limpiarArmado();
        }
        return;
      }

      if (event.cancelable) event.preventDefault();
      setArrastre({ titulo: actual.titulo, x: event.clientX, y: event.clientY });
      setZonaActiva(destinoEn(event.clientX, event.clientY));
    }

    function alSoltar(event: PointerEvent) {
      const actual = armado.current;
      if (!actual) return;

      if (!actual.activo) {
        limpiarArmado();
        return;
      }

      const destino = destinoEn(event.clientX, event.clientY);
      const id = actual.id;

      clickSuprimido.current = true;
      window.setTimeout(() => {
        clickSuprimido.current = false;
      }, 350);

      limpiarArmado();
      setArrastre(null);
      setZonaActiva(null);

      if (destino) void moverTarea(id, destino);
    }

    function alCancelar() {
      limpiarArmado();
      setArrastre(null);
      setZonaActiva(null);
    }

    function alTocar(event: TouchEvent) {
      if (armado.current?.activo && event.cancelable) event.preventDefault();
    }

    window.addEventListener("pointermove", alMover, { passive: false });
    window.addEventListener("pointerup", alSoltar);
    window.addEventListener("pointercancel", alCancelar);
    window.addEventListener("touchmove", alTocar, { passive: false });

    return () => {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      window.removeEventListener("pointercancel", alCancelar);
      window.removeEventListener("touchmove", alTocar);
    };
  }, [activarArrastre, limpiarArmado, moverTarea]);

  const abrirTarea = useCallback((tarea: Tarea) => {
    if (clickSuprimido.current) return;
    setAbierta(tarea);
  }, []);

  const guardarDuracion = useCallback(
    async (tarea: Tarea, minutos: number | null) => {
      await actualizarTarea(tarea.id, { duracion_estimada_min: minutos });
    },
    [actualizarTarea],
  );

  const crearTarea = useCallback(async (datos: NuevaTarea) => {
    const { data, error: errorInsert } = await insforgeBrowser()
      .database.from("tareas")
      .insert([
        {
          titulo: datos.titulo,
          detalle: datos.detalle,
          tipo: datos.tipo,
          estado: "pendiente",
          duracion_estimada_min: datos.duracion_estimada_min,
          paralelizable: datos.paralelizable,
          proyecto_id: datos.proyecto_id,
          fecha_para:
            datos.tipo === "hoy"
              ? hoyISO()
              : datos.tipo === "manana"
                ? mananaISO()
                : null,
        },
      ])
      .select();

    if (errorInsert) throw errorInsert;

    const nueva = (data as Tarea[] | null)?.[0];
    if (!nueva) throw new Error("No se pudo crear la tarea");

    setTareas((prev) => [nueva, ...prev]);

    if (datos.tipo === "proyecto") {
      setTab("proyectos");
      if (datos.proyecto_id) {
        setExpandidos((prev) => new Set(prev).add(datos.proyecto_id as string));
      }
      setAviso("Tarea añadida a Proyectos");
    } else if (datos.tipo === "semana") {
      setTab("semana");
      setAviso("Tarea añadida a Esta semana");
    } else if (datos.tipo === "manana") {
      setTab("manana");
      setAviso("Tarea añadida a Mañana");
    } else {
      setTab("hoy");
      setAviso("Tarea añadida a Hoy");
    }
  }, []);

  const proponerPlan = useCallback(async (minutos: number) => {
    setProponiendo(true);
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
      const nuevoPlan = datos as PlanDia;
      setPlan(nuevoPlan);
      if (nuevoPlan.sugeridas.length === 0) {
        setAviso(
          "No entra ninguna tarea en ese tiempo. Prueba con algo más de margen.",
        );
      }
    } catch (e) {
      setAviso(
        e instanceof Error ? e.message : "No se pudo proponer el plan",
      );
    } finally {
      setProponiendo(false);
    }
  }, []);

  const hoy = useMemo(() => hoyISO(), []);

  const pendientesHoy = useMemo(
    () => tareas.filter((t) => t.tipo === "hoy" && t.estado === "pendiente"),
    [tareas],
  );
  const pendientesManana = useMemo(
    () =>
      tareas.filter((t) => t.tipo === "manana" && t.estado === "pendiente"),
    [tareas],
  );
  const pendientesSemana = useMemo(
    () =>
      tareas.filter((t) => t.tipo === "semana" && t.estado === "pendiente"),
    [tareas],
  );
  const sinTerminar = useMemo(
    () => tareas.filter((t) => t.estado === "sin_terminar"),
    [tareas],
  );

  const hechasRecientes = useMemo(() => {
    const desde = addDias(hoy, -2);
    return tareas.filter(
      (t) =>
        t.estado === "hecha" &&
        t.completed_at &&
        hoyISO(new Date(t.completed_at)) >= desde,
    );
  }, [tareas, hoy]);

  const proyectosPorId = useMemo(() => {
    const mapa = new Map<string, Proyecto>();
    proyectos.forEach((p) => mapa.set(p.id, p));
    return mapa;
  }, [proyectos]);

  const sugeridas = useMemo(() => new Set(plan?.sugeridas ?? []), [plan]);

  const stats = useMemo(
    () => [
      {
        label: "Hechas hoy",
        value: String(tareas.filter((t) => completadaHoy(t, hoy)).length),
        accent: "#22A06B",
        hint: "tareas completadas",
      },
      {
        label: "Racha",
        value: `${calcRacha(tareas, hoy)}`,
        accent: "#D97757",
        hint: calcRacha(tareas, hoy) === 1 ? "día seguido" : "días seguidos",
      },
      {
        label: "Activas",
        value: String(
          pendientesHoy.length + pendientesManana.length + pendientesSemana.length,
        ),
        accent: "#5B5DD6",
        hint: "hoy, mañana y semana",
      },
      {
        label: "Sin terminar",
        value: String(sinTerminar.length),
        accent: "#D6517D",
        hint: "pendientes de reasignar",
      },
    ],
    [
      tareas,
      hoy,
      pendientesHoy.length,
      pendientesManana.length,
      pendientesSemana.length,
      sinTerminar.length,
    ],
  );

  const cuenta: Record<TabKey, number> = {
    hoy: pendientesHoy.length,
    manana: pendientesManana.length,
    semana: pendientesSemana.length,
    proyectos: proyectos.length,
    sin_terminar: sinTerminar.length,
  };

  function alternarProyecto(id: string) {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  function renderTareas(lista: Tarea[], conReasignar: boolean) {
    return lista.map((tarea) => (
      <TaskCard
        key={tarea.id}
        tarea={tarea}
        proyecto={
          tarea.proyecto_id ? proyectosPorId.get(tarea.proyecto_id) : undefined
        }
        sugerida={sugeridas.has(tarea.id)}
        onToggle={alternarHecha}
        onOpen={abrirTarea}
        onReasignar={
          conReasignar
            ? (_tarea, destino) => void moverTarea(_tarea.id, destino)
            : undefined
        }
        onPointerDown={agarrarTarea}
      />
    ));
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      <AppHeader
        saludo={encabezado.saludo}
        fecha={encabezado.fecha}
        pendientesHoy={pendientesHoy.length}
        proponiendo={proponiendo}
        onProponerPlan={proponerPlan}
        onNuevaTarea={() => setCreando(true)}
        onVerHechas={() => setHechasAbiertas(true)}
        hechasRecientes={hechasRecientes.length}
      />

      {plan ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card border border-hoy/25 bg-hoy/[0.06] px-4 py-3">
          <span className="text-[13px] font-semibold text-hoy">
            Plan sugerido
          </span>
          <span className="text-[12.5px] text-[#5A5650]">
            {plan.sugeridas.length}{" "}
            {plan.sugeridas.length === 1 ? "tarea" : "tareas"} ·{" "}
            {formatMin(plan.minutos_ocupados)} en serie
            {plan.minutos_paralelos > 0
              ? ` + ${formatMin(plan.minutos_paralelos)} en paralelo`
              : ""}{" "}
            de {formatMin(plan.disponibles)}
          </span>
          <button
            type="button"
            onClick={() => setPlan(null)}
            className="ml-auto rounded-full px-2.5 py-1 text-[12px] font-medium text-muted transition hover:bg-white hover:text-ink"
          >
            Quitar
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <StatsRow stats={stats} />
      </div>

      {error ? (
        <div className="mt-5 rounded-card border border-sinterminar/30 bg-sinterminar/[0.05] px-4 py-3 text-[13px] text-[#A63C60]">
          <p className="font-medium">No se pudo conectar con InsForge</p>
          <p className="mt-1 leading-relaxed opacity-90">{error}</p>
        </div>
      ) : null}

      {/* Pestañas solo móvil; en escritorio se ven las cinco columnas. */}
      <div className="no-scrollbar -mx-4 mt-6 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden">
        {SECCIONES.map((seccion) => {
          const activa = tab === seccion.key;
          return (
            <button
              key={seccion.key}
              type="button"
              onClick={() => setTab(seccion.key)}
              className={[
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition",
                activa
                  ? "border-transparent bg-white shadow-card text-ink"
                  : "border-transparent bg-white/50 text-muted hover:bg-white",
              ].join(" ")}
              aria-pressed={activa}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: seccion.color }}
              />
              {seccion.corto}
              <span className="text-[11px] tabular-nums opacity-60">
                {cuenta[seccion.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-6 lg:mt-6 lg:grid lg:grid-cols-5 lg:items-start lg:gap-5">
        {SECCIONES.map((seccion) => {
          const visible = tab === seccion.key;
          const esProyectos = seccion.key === "proyectos";
          const lista =
            seccion.key === "hoy"
              ? pendientesHoy
              : seccion.key === "manana"
                ? pendientesManana
                : seccion.key === "semana"
                  ? pendientesSemana
                  : sinTerminar;

          return (
            <section
              key={seccion.key}
              data-destino={esProyectos ? undefined : seccion.key}
              className={[
                visible ? "" : "hidden",
                "min-w-0 rounded-card transition lg:block",
                zonaActiva === seccion.key
                  ? "bg-hoy/[0.05] ring-2 ring-hoy/25"
                  : "",
              ].join(" ")}
              aria-label={seccion.titulo}
            >
              <div className="mb-2.5 flex items-center gap-2 px-1">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: seccion.color }}
                />
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#5F5A52]">
                  {seccion.titulo}
                </h2>
                <span className="text-[11px] tabular-nums text-muted">
                  {cuenta[seccion.key]}
                </span>
              </div>

              {esProyectos ? (
                <ProjectsColumn
                  proyectos={proyectos}
                  tareas={tareas}
                  sugeridas={sugeridas}
                  expandidos={expandidos}
                  onAlternarProyecto={alternarProyecto}
                  onToggleTarea={alternarHecha}
                  onAbrirTarea={abrirTarea}
                  zonaActiva={zonaActiva}
                  onPointerDownTarea={agarrarTarea}
                />
              ) : cargando ? (
                <div className="space-y-2.5">
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      className="h-[74px] animate-pulse rounded-card border border-line bg-white/60"
                    />
                  ))}
                </div>
              ) : lista.length === 0 ? (
                <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-[12.5px] leading-relaxed text-muted">
                  {seccion.vacio}
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {renderTareas(lista, seccion.key === "sin_terminar")}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {creando ? (
        <NewTaskPanel
          proyectos={proyectos}
          onCerrar={() => setCreando(false)}
          onCrear={crearTarea}
        />
      ) : null}

      {hechasAbiertas ? (
        <HechasPanel
          tareas={hechasRecientes}
          proyectos={proyectosPorId}
          onCerrar={() => setHechasAbiertas(false)}
        />
      ) : null}

      {abierta ? (
        <TaskDetailPanel
          key={abierta.id}
          tarea={abierta}
          proyecto={
            abierta.proyecto_id
              ? proyectosPorId.get(abierta.proyecto_id)
              : undefined
          }
          onCerrar={() => setAbierta(null)}
          onGuardarDuracion={guardarDuracion}
          onAlternarHecha={alternarHecha}
          onMover={(tarea, destino) => moverTarea(tarea.id, destino)}
        />
      ) : null}

      {arrastre ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[70] w-[230px] -translate-x-1/2 -translate-y-1/2 rotate-1 rounded-card border border-hoy/40 bg-white px-3.5 py-3 text-[13.5px] font-medium leading-snug text-ink shadow-float"
          style={{ left: arrastre.x, top: arrastre.y }}
        >
          {arrastre.titulo}
        </div>
      ) : null}

      {aviso ? (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-[12px] bg-ink px-4 py-2.5 text-center text-[13px] text-white shadow-float"
        >
          {aviso}
        </div>
      ) : null}
    </main>
  );
}
