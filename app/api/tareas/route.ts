import { hoyISO, mananaISO } from "@/lib/dates";
import { fechaDeTexto } from "@/lib/fechas";
import { insforgeServer } from "@/lib/insforge/server";
import { crearRecordatoriosTarea } from "@/lib/recordatorios";
import type { Tarea, Tipo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS: Tipo[] = ["hoy", "manana", "semana", "proyecto", "programada"];

export async function POST(request: Request) {
  try {
    const cuerpo = (await request.json()) as Record<string, unknown>;

    const titulo = typeof cuerpo.titulo === "string" ? cuerpo.titulo.trim() : "";
    const tipo = TIPOS.includes(cuerpo.tipo as Tipo)
      ? (cuerpo.tipo as Tipo)
      : null;

    if (!titulo || !tipo) {
      return Response.json(
        { error: "Faltan el título o el destino de la tarea." },
        { status: 400 },
      );
    }

    const fecha =
      tipo === "programada"
        ? fechaDeTexto(String(cuerpo.fecha_para ?? ""), hoyISO()) ??
          (typeof cuerpo.fecha_para === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(cuerpo.fecha_para)
            ? cuerpo.fecha_para
            : null)
        : null;

    if (tipo === "programada" && !fecha) {
      return Response.json(
        { error: "Indica una fecha válida para la tarea programada." },
        { status: 400 },
      );
    }

    const { data, error } = await insforgeServer()
      .database.from("tareas")
      .insert([
        {
          titulo,
          detalle: typeof cuerpo.detalle === "string" ? cuerpo.detalle.trim() : "",
          tipo,
          estado: "pendiente",
          duracion_estimada_min:
            typeof cuerpo.duracion_estimada_min === "number"
              ? cuerpo.duracion_estimada_min
              : null,
          paralelizable: cuerpo.paralelizable === true,
          proyecto_id:
            typeof cuerpo.proyecto_id === "string" ? cuerpo.proyecto_id : null,
          fecha_para:
            tipo === "hoy"
              ? hoyISO()
              : tipo === "manana"
                ? mananaISO()
                : tipo === "programada"
                  ? fecha
                  : null,
        },
      ])
      .select("*");

    if (error) throw error;

    const tarea = (data as Tarea[] | null)?.[0];
    if (!tarea) throw new Error("No se pudo crear la tarea");

    if (tipo === "programada" && fecha) {
      await crearRecordatoriosTarea({
        titulo: tarea.titulo,
        detalle: tarea.detalle,
        fecha,
      });
    }

    return Response.json({ tarea });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error creando tarea", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
