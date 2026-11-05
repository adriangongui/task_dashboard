import {
  borrarSuscripciones,
  guardarSuscripcion,
  suscripcionesPush,
} from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CuerpoSuscripcion {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function GET() {
  try {
    const total = (await suscripcionesPush()).length;
    return Response.json({ total }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error leyendo las suscripciones push", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let cuerpo: CuerpoSuscripcion;

  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const endpoint = cuerpo.endpoint;
  const p256dh = cuerpo.keys?.p256dh;
  const auth = cuerpo.keys?.auth;

  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    typeof p256dh !== "string" ||
    p256dh.length === 0 ||
    typeof auth !== "string" ||
    auth.length === 0
  ) {
    return Response.json(
      { error: "Suscripción no válida" },
      { status: 400 },
    );
  }

  try {
    const total = await guardarSuscripcion({
      endpoint,
      keys: { p256dh, auth },
    });

    return Response.json({ ok: true, total });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error guardando la suscripción push", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let cuerpo: { endpoint?: string };

  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (typeof cuerpo.endpoint !== "string" || !cuerpo.endpoint) {
    return Response.json({ error: "Falta el endpoint" }, { status: 400 });
  }

  try {
    await borrarSuscripciones([cuerpo.endpoint]);
    return Response.json({ ok: true });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error borrando la suscripción push", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
