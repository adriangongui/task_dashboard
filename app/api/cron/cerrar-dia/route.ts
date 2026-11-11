import { hoyISO, mananaISO } from "@/lib/dates";
import { insforgeServer } from "@/lib/insforge/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TareaVencida {
  id: string;
  fecha_para: string | null;
  created_at: string;
}

/**
 * Cierre del día:
 *  1. Las tareas de "Mañana" pasan a "Hoy" con la fecha de hoy.
 *  2. Las de "Hoy" que siguen pendientes pasan a "Sin terminar".
 * Es idempotente: una tarea solo se mueve si su fecha (o, si no tiene, su día
 * de creación) es anterior a hoy, así que se puede llamar varias veces sin
 * efectos raros.
 */
export async function GET() {
  try {
    const insforge = insforgeServer();
    const hoy = hoyISO();

    // Las tareas programadas se acercan solas: el día antes pasan a Mañana y
    // el día de la fecha, a Hoy, para que no se queden olvidadas.
    const { data: programadas, error: errorProgramadas } = await insforge.database
      .from("tareas")
      .select("id, fecha_para")
      .eq("tipo", "programada")
      .eq("estado", "pendiente");

    if (errorProgramadas) throw errorProgramadas;

    const manana = mananaISO();
    const programadasHoy = ((programadas ?? []) as Array<{
      id: string;
      fecha_para: string | null;
    }>)
      .filter((t) => t.fecha_para && t.fecha_para <= hoy)
      .map((t) => t.id);
    const programadasManana = ((programadas ?? []) as Array<{
      id: string;
      fecha_para: string | null;
    }>)
      .filter((t) => t.fecha_para === manana)
      .map((t) => t.id);

    if (programadasHoy.length > 0) {
      const { error } = await insforge.database
        .from("tareas")
        .update({ tipo: "hoy" })
        .in("id", programadasHoy);
      if (error) throw error;
    }

    if (programadasManana.length > 0) {
      const { error } = await insforge.database
        .from("tareas")
        .update({ tipo: "manana" })
        .in("id", programadasManana);
      if (error) throw error;
    }

    const { data: paraManana, error: errorManana } = await insforge.database
      .from("tareas")
      .select("id")
      .eq("tipo", "manana")
      .eq("estado", "pendiente");

    if (errorManana) throw errorManana;

    const promovidas = ((paraManana ?? []) as Array<{ id: string }>).map(
      (t) => t.id,
    );

    if (promovidas.length > 0) {
      const { error: errorPromover } = await insforge.database
        .from("tareas")
        .update({ tipo: "hoy", fecha_para: hoy })
        .in("id", promovidas);

      if (errorPromover) throw errorPromover;
    }

    const { data, error } = await insforge.database
      .from("tareas")
      .select("id, fecha_para, created_at")
      .eq("tipo", "hoy")
      .eq("estado", "pendiente");

    if (error) throw error;

    const vencidas = ((data ?? []) as unknown as TareaVencida[]).filter((t) =>
      t.fecha_para ? t.fecha_para < hoy : hoyISO(new Date(t.created_at)) < hoy,
    );

    if (vencidas.length > 0) {
      const { error: errorUpdate } = await insforge.database
        .from("tareas")
        .update({ estado: "sin_terminar" })
        .in(
          "id",
          vencidas.map((t) => t.id),
        );

      if (errorUpdate) throw errorUpdate;
    }

    return Response.json({
      ok: true,
      programadas_hoy: programadasHoy.length,
      programadas_manana: programadasManana.length,
      promovidas: promovidas.length,
      movidas: vencidas.length,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error cerrando el día", error);
    return Response.json({ ok: false, error: mensaje }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
