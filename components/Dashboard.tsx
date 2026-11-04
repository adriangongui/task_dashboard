"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { calcRacha, completadaHoy, fechaLarga, hoyISO, horaLocal, saludo } from "@/lib/dates";
import { formatMin } from "@/lib/duration";
import type { PlanDia } from "@/lib/plan";
import type { NuevaTarea, Proyecto, Tarea } from "@/lib/types";
import { insforgeBrowser, insforgeConfigurado } from "@/lib/insforge/client";
import AppHeader from "./AppHeader";
import ProjectsColumn from "./ProjectsColumn";
import StatsRow from "./StatsRow";
import TaskCard from "./TaskCard";
import TaskDetailPanel from "./TaskDetailPanel";
import NewTaskPanel from "./NewTaskPanel";

type TabKey = "hoy" | "semana" | "proyectos" | "sin_terminar";

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
  const [aviso, setAviso] = useState<string | null>(null);
  const [encabezado, setEncabezado] = useState<{ saludo: string; fecha: string }>({
    saludo: "",
    fecha: "",
  });

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
      setTareas((prev) =>
        prev.map((t) => (t.id === id ? actualizada : t)),
      );
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

  const reasignar = useCallback(
    async (tarea: Tarea, destino: "hoy" | "semana") => {
      try {
        await actualizarTarea(tarea.id, {
          tipo: destino,
          estado: "pendiente",
          fecha_para: destino === "hoy" ? hoyISO() : null,
        });
        setAviso(
          destino === "hoy"
            ? "Movida a Hoy"
            : "Movida a Esta semana",
        );
      } catch (e) {
        setAviso(
          e instanceof Error ? `No se pudo mover: ${e.message}` : "No se pudo mover la tarea",
        );
      }
    },
    [actualizarTarea],
  );

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
          fecha_para: datos.tipo === "hoy" ? hoyISO() : null,
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
    () =>
      tareas.filter((t) => t.tipo === "hoy" && t.estado === "pendiente"),
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

  const proyectosPorId = useMemo(() => {
    const mapa = new Map<string, Proyecto>();
    proyectos.forEach((p) => mapa.set(p.id, p));
    return mapa;
  }, [proyectos]);

  const sugeridas = useMemo(
    () => new Set(plan?.sugeridas ?? []),
    [plan],
  );

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
        label: "Activas esta semana",
        value: String(pendientesHoy.length + pendientesSemana.length),
        accent: "#5B5DD6",
        hint: "hoy y semana",
      },
      {
        label: "Sin terminar",
        value: String(sinTerminar.length),
        accent: "#D6517D",
        hint: "pendientes de reasignar",
      },
    ],
    [tareas, hoy, pendientesHoy.length, pendientesSemana.length, sinTerminar.length],
  );

  const cuenta: Record<TabKey, number> = {
    hoy: pendientesHoy.length,
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
        onOpen={setAbierta}
        onReasignar={conReasignar ? reasignar : undefined}
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

      {/* Pestañas solo móvil; en escritorio se ven las cuatro columnas. */}
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

      <div className="mt-4 flex flex-col gap-6 lg:mt-6 lg:grid lg:grid-cols-4 lg:items-start lg:gap-6">
        {SECCIONES.map((seccion) => {
          const visible = tab === seccion.key;
          const esProyectos = seccion.key === "proyectos";
          const lista =
            seccion.key === "hoy"
              ? pendientesHoy
              : seccion.key === "semana"
                ? pendientesSemana
                : sinTerminar;

          return (
            <section
              key={seccion.key}
              className={[
                visible ? "" : "hidden",
                "min-w-0 lg:block",
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
                  {countFor(seccion.key, {
                    hoy: pendientesHoy.length,
                    semana: pendientesSemana.length,
                    proyectos: proyectos.length,
                    sin_terminar: sinTerminar.length,
                  })}
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
                  onAbrirTarea={setAbierta}
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
        />
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

function countFor(key: TabKey, cuentas: Record<TabKey, number>): number {
  return cuentas[key];
}
