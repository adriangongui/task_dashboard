import { hoyISO } from "@/lib/dates";
import { insforgeServer } from "@/lib/insforge/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TareaVencida {
  id: string;
  fecha_para: string | null;
  created_at: string;
}

/**
 * Cierre del día: las tareas de "Hoy" que siguen pendientes pasan a
 * "Sin terminar". Es idempotente: una tarea solo se mueve si su fecha
 * (o, si no tiene, su día de creación) es anterior a hoy, así que se puede
 * llamar varias veces sin efectos raros.
 */
export async function GET() {
  try {
    const insforge = insforgeServer();
    const hoy = hoyISO();

    const { data, error } = await insforge.database
      .from("tareas")
      .select("id, fecha_para, created_at")
      .eq("tipo", "hoy")
      .eq("estado", "pendiente");

    if (error) throw error;

    const vencidas = ((data ?? []) as unknown as TareaVencida[]).filter((t) =>
      t.fecha_para ? t.fecha_para < hoy : hoyISO(new Date(t.created_at)) < hoy,
    );

    if (vencidas.length === 0) {
      return Response.json({ ok: true, movidas: 0 });
    }

    const { error: errorUpdate } = await insforge.database
      .from("tareas")
      .update({ estado: "sin_terminar" })
      .in(
        "id",
        vencidas.map((t) => t.id),
      );

    if (errorUpdate) throw errorUpdate;

    return Response.json({ ok: true, movidas: vencidas.length });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error cerrando el día", error);
    return Response.json({ ok: false, error: mensaje }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
