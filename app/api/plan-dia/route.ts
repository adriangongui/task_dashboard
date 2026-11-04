import { parsearTiempo } from "@/lib/duration";
import { insforgeServer } from "@/lib/insforge/server";
import { calcularPlan } from "@/lib/plan";
import type { Tarea } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let cuerpo: { minutos?: number | string; tiempo?: string };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const minutos =
    typeof cuerpo.minutos === "number"
      ? Math.round(cuerpo.minutos)
      : parsearTiempo(String(cuerpo.minutos ?? cuerpo.tiempo ?? ""));

  if (!minutos || minutos <= 0) {
    return Response.json(
      { error: "Indica el tiempo disponible, por ejemplo “2h 30min”." },
      { status: 400 },
    );
  }

  try {
    const insforge = insforgeServer();
    const { data, error } = await insforge.database
      .from("tareas")
      .select("*")
      .eq("tipo", "hoy")
      .eq("estado", "pendiente");

    if (error) throw error;

    const plan = calcularPlan((data ?? []) as unknown as Tarea[], minutos);
    return Response.json(plan);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error calculando el plan del día", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
