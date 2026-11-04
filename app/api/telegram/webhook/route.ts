import { clasificarTarea } from "@/lib/ai";
import { hoyISO } from "@/lib/dates";
import { insforgeServer } from "@/lib/insforge/server";
import { colorParaNombre } from "@/lib/palette";
import type { Proyecto } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpdateTelegram {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number | string };
  };
  edited_message?: {
    text?: string;
    chat?: { id?: number | string };
  };
}

const ETIQUETA_TIPO: Record<string, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  proyecto: "Proyectos",
};

async function enviarMensaje(chatId: number | string, texto: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    });
  } catch (error) {
    console.error("No se pudo responder en Telegram", error);
  }
}

function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export async function POST(request: Request) {
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secreto) {
    const recibido = request.headers.get("x-telegram-bot-api-secret-token");
    if (recibido !== secreto) {
      return Response.json({ ok: false, error: "no autorizado" }, { status: 401 });
    }
  }

  let update: UpdateTelegram;
  try {
    update = (await request.json()) as UpdateTelegram;
  } catch {
    return Response.json({ ok: true, ignored: "json inválido" });
  }

  const mensaje = update.message ?? update.edited_message;
  const chatId = mensaje?.chat?.id;
  const texto = mensaje?.text?.trim();

  if (!chatId || !texto) {
    return Response.json({ ok: true, ignored: "sin texto" });
  }

  if (texto.startsWith("/start") || texto.startsWith("/help")) {
    await enviarMensaje(
      chatId,
      "Escríbeme una tarea y la clasifico sola. Puedes mandar una nota larga o una transcripción de voz: yo saco el título, el proyecto y la duración.",
    );
    return Response.json({ ok: true });
  }

  try {
    const insforge = insforgeServer();

    const { data: proyectos, error: errorProyectos } = await insforge.database
      .from("proyectos")
      .select("id, nombre, color, created_at")
      .order("created_at", { ascending: true });

    if (errorProyectos) throw errorProyectos;

    const listaProyectos = (proyectos ?? []) as unknown as Proyecto[];

    const clasificacion = await clasificarTarea(
      texto,
      listaProyectos.map((p) => p.nombre),
    );

    // Resolver el proyecto: por nombre existente (sin distinguir mayúsculas
    // ni acentos) o creándolo si la IA propone uno nuevo.
    let proyectoId: string | null = null;
    let nombreProyecto: string | null = null;

    if (clasificacion.proyecto_sugerido) {
      const buscado = normalizarNombre(clasificacion.proyecto_sugerido);
      const existente = listaProyectos.find(
        (p) => normalizarNombre(p.nombre) === buscado,
      );

      if (existente) {
        proyectoId = existente.id;
        nombreProyecto = existente.nombre;
      } else {
        const { data: creado, error: errorCrear } = await insforge.database
          .from("proyectos")
          .insert([
            {
              nombre: clasificacion.proyecto_sugerido,
              color: colorParaNombre(clasificacion.proyecto_sugerido),
            },
          ])
          .select();

        if (errorCrear) throw errorCrear;

        const nuevo = (creado as Array<{ id?: string; nombre?: string }> | null)?.[0];
        if (!nuevo?.id) throw new Error("No se pudo crear el proyecto");

        proyectoId = nuevo.id;
        nombreProyecto = nuevo.nombre ?? clasificacion.proyecto_sugerido;
      }
    }

    const { error: errorInsert } = await insforge.database.from("tareas").insert([
      {
        titulo: clasificacion.titulo,
        detalle: clasificacion.detalle,
        tipo: clasificacion.tipo,
        estado: "pendiente",
        duracion_estimada_min: clasificacion.duracion_estimada_min,
        paralelizable: clasificacion.paralelizable,
        proyecto_id: proyectoId,
        fecha_para: clasificacion.tipo === "hoy" ? hoyISO() : null,
      },
    ]);

    if (errorInsert) throw errorInsert;

    const destino =
      clasificacion.tipo === "proyecto" && nombreProyecto
        ? nombreProyecto
        : (ETIQUETA_TIPO[clasificacion.tipo] ?? clasificacion.tipo);

    await enviarMensaje(
      chatId,
      `✅ Añadida a ${destino}: ${clasificacion.titulo}`,
    );

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Error procesando el mensaje de Telegram", error);
    const mensajeError =
      error instanceof Error ? error.message : "error desconocido";
    await enviarMensaje(
      chatId,
      `❌ No he podido guardar la tarea. Detalle: ${mensajeError.slice(0, 200)}`,
    );
    // 200 para que Telegram no reintente en bucle un mensaje fallido.
    return Response.json({ ok: false, error: mensajeError }, { status: 200 });
  }
}

export async function GET() {
  return Response.json({ ok: true, endpoint: "telegram-webhook" });
}
