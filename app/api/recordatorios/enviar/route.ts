import {
  marcarEnviado,
  pendientesDeEnviar,
  tokenRecordatorios,
} from "@/lib/recordatorios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function enviar(chatId: string, texto: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  try {
    const respuesta = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: texto }),
      },
    );

    if (!respuesta.ok) {
      console.error(
        "Telegram rechazó el recordatorio",
        respuesta.status,
        (await respuesta.text()).slice(0, 200),
      );
    }

    return respuesta.ok;
  } catch (error) {
    console.error("No se pudo enviar el recordatorio", error);
    return false;
  }
}

/**
 * Lo llama un schedule de InsForge cada minuto. Manda los recordatorios que
 * ya han vencido y los marca para no repetirlos.
 */
async function procesar(request: Request) {
  try {
    const esperado = await tokenRecordatorios();
    const recibido = request.headers.get("x-recordatorios-token");

    if (!esperado || recibido !== esperado) {
      return Response.json(
        { ok: false, error: "no autorizado" },
        { status: 401 },
      );
    }

    const pendientes = await pendientesDeEnviar();
    let enviados = 0;

    for (const recordatorio of pendientes) {
      if (!recordatorio.chat_id) {
        await marcarEnviado(recordatorio.id);
        continue;
      }

      const texto =
        recordatorio.detalle &&
        recordatorio.detalle.trim() !== recordatorio.titulo.trim()
          ? `⏰ Recuerda: ${recordatorio.titulo}\n\n${recordatorio.detalle}`
          : `⏰ Recuerda: ${recordatorio.titulo}`;

      const ok = await enviar(recordatorio.chat_id, texto);
      if (ok) {
        await marcarEnviado(recordatorio.id);
        enviados += 1;
      }
    }

    return Response.json({
      ok: true,
      pendientes: pendientes.length,
      enviados,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error enviando recordatorios", error);
    return Response.json({ ok: false, error: mensaje }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return procesar(request);
}

export async function POST(request: Request) {
  return procesar(request);
}
