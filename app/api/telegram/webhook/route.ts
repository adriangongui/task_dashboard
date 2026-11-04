import { clasificarTarea, interpretarDestino } from "@/lib/ai";
import { hoyISO } from "@/lib/dates";
import { insforgeServer } from "@/lib/insforge/server";
import { colorParaNombre } from "@/lib/palette";
import {
  borrarPendiente,
  guardarPendiente,
  obtenerPendiente,
  type TareaPendiente,
} from "@/lib/pending";
import type { Proyecto, Tipo } from "@/lib/types";

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
  proyecto: "Proyectos futuros",
};

async function enviarMensaje(chatId: number | string, texto: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

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
        "Telegram rechazó el mensaje",
        respuesta.status,
        (await respuesta.text()).slice(0, 200),
      );
    }
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

function preguntaDestino(titulo: string, proyectos: string[]): string {
  const extra =
    proyectos.length > 0 ? `\nProyectos: ${proyectos.join(", ")}.` : "";
  return `🤔 No sé dónde poner «${titulo}».\n¿Hoy, esta semana o en un proyecto?${extra}\nSi no la quieres, dime «cancela».`;
}

async function cargarProyectos(): Promise<Proyecto[]> {
  const insforge = insforgeServer();

  const { data, error } = await insforge.database
    .from("proyectos")
    .select("id, nombre, color, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []) as unknown as Proyecto[];
}

async function resolverProyecto(
  nombre: string,
  proyectos: Proyecto[],
): Promise<{ id: string; nombre: string }> {
  const buscado = normalizarNombre(nombre);
  const existente = proyectos.find(
    (p) => normalizarNombre(p.nombre) === buscado,
  );

  if (existente) {
    return { id: existente.id, nombre: existente.nombre };
  }

  const insforge = insforgeServer();

  const { data: creado, error } = await insforge.database
    .from("proyectos")
    .insert([{ nombre, color: colorParaNombre(nombre) }])
    .select();

  if (error) throw error;

  const nuevo = (creado as Array<{ id?: string; nombre?: string }> | null)?.[0];
  if (!nuevo?.id) throw new Error("No se pudo crear el proyecto");

  return { id: nuevo.id, nombre: nuevo.nombre ?? nombre };
}

async function insertarTarea(datos: {
  titulo: string;
  detalle: string;
  tipo: Tipo;
  duracion: number | null;
  paralelizable: boolean;
  proyectoId: string | null;
}): Promise<void> {
  const insforge = insforgeServer();

  const { error } = await insforge.database.from("tareas").insert([
    {
      titulo: datos.titulo,
      detalle: datos.detalle,
      tipo: datos.tipo,
      estado: "pendiente",
      duracion_estimada_min: datos.duracion,
      paralelizable: datos.paralelizable,
      proyecto_id: datos.proyectoId,
      fecha_para: datos.tipo === "hoy" ? hoyISO() : null,
    },
  ]);

  if (error) throw error;
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

  if (/^\/(start|help)\b/.test(texto)) {
    await enviarMensaje(
      chatId,
      "Escríbeme una tarea y la clasifico sola. Puedes mandar una nota larga o una transcripción de voz: yo saco el título, el proyecto y la duración.\n\nSi no tengo claro dónde ponerla, te preguntaré: respóndeme «hoy», «esta semana» o el nombre del proyecto.",
    );
    return Response.json({ ok: true });
  }

  let pendiente: TareaPendiente | null = null;

  try {
    const listaProyectos = await cargarProyectos();
    const nombres = listaProyectos.map((p) => p.nombre);

    pendiente = await obtenerPendiente(chatId);

    // Hay una tarea esperando destino: este mensaje es la respuesta.
    if (pendiente) {
      const tituloPendiente = pendiente.titulo;
      const destino = await interpretarDestino(texto, nombres, tituloPendiente);

      if (destino.accion === "cancelar") {
        await borrarPendiente(pendiente.id);
        pendiente = null;
        await enviarMensaje(chatId, `Vale, descarto «${tituloPendiente}».`);
        return Response.json({ ok: true, cancelada: true });
      }

      if (destino.accion === "duda") {
        await enviarMensaje(chatId, preguntaDestino(tituloPendiente, nombres));
        return Response.json({ ok: true, pregunta: true });
      }

      if (destino.accion === "proyecto" && !destino.proyecto) {
        await enviarMensaje(
          chatId,
          `¿En qué proyecto la pongo?${nombres.length > 0 ? `\nProyectos: ${nombres.join(", ")}.` : ""}\nO dime «hoy» / «esta semana».`,
        );
        return Response.json({ ok: true, pregunta: true });
      }

      const proyecto =
        destino.accion === "proyecto" && destino.proyecto
          ? await resolverProyecto(destino.proyecto, listaProyectos)
          : null;

      await insertarTarea({
        titulo: pendiente.titulo,
        detalle: pendiente.detalle,
        tipo: destino.accion as Tipo,
        duracion: pendiente.duracion_estimada_min,
        paralelizable: pendiente.paralelizable,
        proyectoId: proyecto?.id ?? null,
      });

      await borrarPendiente(pendiente.id);
      pendiente = null;

      const donde = proyecto?.nombre ?? ETIQUETA_TIPO[destino.accion] ?? "tu lista";
      await enviarMensaje(chatId, `✅ Añadida a ${donde}: ${tituloPendiente}`);

      return Response.json({ ok: true, desdePendiente: true });
    }

    const clasificacion = await clasificarTarea(texto, nombres);

    // Sin pistas de cuándo ni dónde: preguntamos y la guardamos en espera.
    if (!clasificacion.destino_claro && !clasificacion.proyecto_sugerido) {
      await guardarPendiente(chatId, clasificacion, texto);
      await enviarMensaje(
        chatId,
        preguntaDestino(clasificacion.titulo, nombres),
      );
      return Response.json({ ok: true, pregunta: true });
    }

    const proyecto = clasificacion.proyecto_sugerido
      ? await resolverProyecto(clasificacion.proyecto_sugerido, listaProyectos)
      : null;

    await insertarTarea({
      titulo: clasificacion.titulo,
      detalle: clasificacion.detalle,
      tipo: clasificacion.tipo,
      duracion: clasificacion.duracion_estimada_min,
      paralelizable: clasificacion.paralelizable,
      proyectoId: proyecto?.id ?? null,
    });

    const destino =
      clasificacion.tipo === "proyecto" && proyecto
        ? proyecto.nombre
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

    const titulo = pendiente?.titulo;
    const reintento = pendiente
      ? " Sigue pendiente: dime otra vez dónde va."
      : "";

    await enviarMensaje(
      chatId,
      `❌ No he podido guardar la tarea${titulo ? ` «${titulo}»` : ""}.${reintento}\nDetalle: ${mensajeError.slice(0, 200)}`,
    );

    // 200 para que Telegram no reintente en bucle un mensaje fallido.
    return Response.json({ ok: false, error: mensajeError }, { status: 200 });
  }
}

export async function GET() {
  return Response.json({ ok: true, endpoint: "telegram-webhook" });
}
