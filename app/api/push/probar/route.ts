import { enviarPushRecordatorio, suscripcionesPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    if ((await suscripcionesPush()).length === 0) {
      return Response.json(
        { ok: false, error: "No hay ningún dispositivo activado." },
        { status: 409 },
      );
    }

    const enviados = await enviarPushRecordatorio({
      id: "prueba",
      titulo: "Prueba de aviso",
      detalle: "Si ves esto, los recordatorios llegarán a tu móvil.",
    });

    if (enviados === 0) {
      return Response.json(
        { ok: false, error: "No se pudo entregar el aviso a este dispositivo." },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, enviados });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error enviando la prueba push", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
