import { insforgeServer } from "@/lib/insforge/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPOS =
  "id, titulo, detalle, recordar_at, enviado, created_at";

export async function GET() {
  try {
    const db = insforgeServer().database;

    const [pendientes, enviados] = await Promise.all([
      db
        .from("recordatorios")
        .select(CAMPOS)
        .eq("enviado", false)
        .order("recordar_at", { ascending: true })
        .limit(100),
      db
        .from("recordatorios")
        .select(CAMPOS)
        .eq("enviado", true)
        .order("recordar_at", { ascending: false })
        .limit(100),
    ]);

    if (pendientes.error) throw pendientes.error;
    if (enviados.error) throw enviados.error;

    return Response.json({
      pendientes: pendientes.data ?? [],
      enviados: enviados.data ?? [],
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error listando recordatorios", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let cuerpo: { accion?: string; id?: string };

  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (cuerpo.accion !== "borrar" || !cuerpo.id) {
    return Response.json({ error: "Acción no válida" }, { status: 400 });
  }

  try {
    const { error } = await insforgeServer()
      .database.from("recordatorios")
      .delete()
      .eq("id", cuerpo.id);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error borrando recordatorio", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
