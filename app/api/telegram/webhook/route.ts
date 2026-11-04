import { clasificarTarea, interpretarDestino } from "@/lib/ai";
import { parsearComando } from "@/lib/comandos";
import { hoyISO, mananaISO } from "@/lib/dates";
import { interpretarDestinoRapido } from "@/lib/destino";
import {
  guardarEstado,
  limpiarAccion,
  obtenerEstado,
  recordarUltimaTarea,
} from "@/lib/estado";
import { insforgeServer } from "@/lib/insforge/server";
import { colorParaNombre } from "@/lib/palette";
import {
  borrarPendiente,
  guardarPendiente,
  obtenerPendiente,
  type TareaPendiente,
} from "@/lib/pending";
import type { Proyecto, Tarea, Tipo } from "@/lib/types";

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
  manana: "Mañana",
  semana: "Esta semana",
  proyecto: "Proyectos futuros",
};

function fechaParaTipo(tipo: Tipo): string | null {
  if (tipo === "hoy") return hoyISO();
  if (tipo === "manana") return mananaISO();
  return null;
}

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
  return `🤔 No sé dónde poner «${titulo}».\n¿Hoy, mañana, esta semana o en un proyecto?${extra}\nSi no la quieres, dime «cancela».`;
}

const TIPOS_VALIDOS: Tipo[] = ["hoy", "manana", "semana", "proyecto"];

interface TareaPropuesta {
  titulo: string;
  detalle: string;
  tipo: Tipo;
  duracion: number | null;
  paralelizable: boolean;
  proyectoId: string | null;
  proyectoNombre: string | null;
}

function respuestaAfirmativa(texto: string): boolean {
  return /^(s[ií]|vale|ok|okey|crea(?:la)?|adelante|claro|hazlo|confirmo)$/i.test(
    texto.trim().replace(/[.!]+$/, ""),
  );
}

function respuestaNegativa(texto: string): boolean {
  return /^(no|nope|cancela|cancelar|mejor no|nada|d[eé]jalo)$/i.test(
    texto.trim().replace(/[.!]+$/, ""),
  );
}

function leerPropuesta(datos: Record<string, unknown>): TareaPropuesta | null {
  const titulo = typeof datos.titulo === "string" ? datos.titulo : "";
  const tipo = datos.tipo as Tipo;

  if (!titulo || !TIPOS_VALIDOS.includes(tipo)) return null;

  return {
    titulo,
    detalle: typeof datos.detalle === "string" ? datos.detalle : "",
    tipo,
    duracion: typeof datos.duracion === "number" ? datos.duracion : null,
    paralelizable: datos.paralelizable === true,
    proyectoId:
      typeof datos.proyectoId === "string" ? datos.proyectoId : null,
    proyectoNombre:
      typeof datos.proyectoNombre === "string" ? datos.proyectoNombre : null,
  };
}

function resumenPropuesta(tarea: TareaPropuesta): string {
  const lineas = [`• Tarea: ${tarea.titulo}`];
  lineas.push(
    `• Dónde: ${tarea.proyectoNombre ?? ETIQUETA_TIPO[tarea.tipo] ?? tarea.tipo}`,
  );
  if (tarea.duracion) lineas.push(`• Duración: ${tarea.duracion} min`);
  if (tarea.paralelizable) lineas.push("• Paralelizable");
  return lineas.join("\n");
}

/** No crea nada: guarda la propuesta y espera un «sí» explícito. */
async function proponerTarea(
  chatId: number | string,
  tarea: TareaPropuesta,
): Promise<void> {
  await guardarEstado(chatId, {
    accion: "confirmar_tarea",
    datos: { ...tarea },
  });
  await enviarMensaje(
    chatId,
    `¿Creo esta tarea?\n\n${resumenPropuesta(tarea)}\n\nResponde «sí» para crearla o «no» para cancelar.`,
  );
}

function pedirColumna(): string {
  return "¿De qué columna quieres borrar?\nDime «hoy», «mañana» o «esta semana».";
}

function listadoParaBorrar(tareas: Tarea[]): string {
  const lineas = tareas.map(
    (t, i) => `${i + 1}. ${t.titulo}${t.tipo ? ` · ${ETIQUETA_TIPO[t.tipo] ?? t.tipo}` : ""}`,
  );
  return `¿Cuál borro?\n${lineas.join("\n")}\n\nDime el número (o parte del título). «cancela» para dejarlo.`;
}

function elegirDeLista(texto: string, tareas: Tarea[]): Tarea | null {
  const numero = texto.match(/^\d{1,2}$/);
  if (numero) {
    return tareas[Number(numero[0]) - 1] ?? null;
  }

  const buscado = normalizarNombre(texto);
  if (!buscado) return null;

  return (
    tareas.find((t) => normalizarNombre(t.titulo).includes(buscado)) ?? null
  );
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

/** Busca un proyecto existente. Nunca lo crea: eso solo se hace si lo pides. */
function buscarProyecto(
  nombre: string,
  proyectos: Proyecto[],
): Proyecto | undefined {
  const buscado = normalizarNombre(nombre);
  if (!buscado) return undefined;

  return (
    proyectos.find((p) => normalizarNombre(p.nombre) === buscado) ??
    proyectos.find((p) => {
      const actual = normalizarNombre(p.nombre);
      return actual.includes(buscado) || buscado.includes(actual);
    })
  );
}

async function crearProyecto(nombre: string): Promise<Proyecto> {
  const insforge = insforgeServer();

  const { data, error } = await insforge.database
    .from("proyectos")
    .insert([{ nombre, color: colorParaNombre(nombre) }])
    .select();

  if (error) throw error;

  const nuevo = (data as Proyecto[] | null)?.[0];
  if (!nuevo?.id) throw new Error("No se pudo crear el proyecto");

  return nuevo;
}

async function listarPendientes(tipo: Tipo): Promise<Tarea[]> {
  const { data, error } = await insforgeServer()
    .database.from("tareas")
    .select("*")
    .eq("tipo", tipo)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []) as unknown as Tarea[];
}

async function listarPendientesTodas(): Promise<Tarea[]> {
  const { data, error } = await insforgeServer()
    .database.from("tareas")
    .select("*")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []) as unknown as Tarea[];
}

async function tareaPorId(id: string): Promise<Tarea | null> {
  const { data, error } = await insforgeServer()
    .database.from("tareas")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (error) throw error;

  return (data as Tarea[] | null)?.[0] ?? null;
}

async function tareaMasReciente(): Promise<Tarea | null> {
  const { data, error } = await insforgeServer()
    .database.from("tareas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  return (data as Tarea[] | null)?.[0] ?? null;
}

async function borrarTarea(id: string): Promise<void> {
  const { error } = await insforgeServer()
    .database.from("tareas")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

async function insertarTarea(datos: {
  titulo: string;
  detalle: string;
  tipo: Tipo;
  duracion: number | null;
  paralelizable: boolean;
  proyectoId: string | null;
}): Promise<string> {
  const insforge = insforgeServer();

  const { data, error } = await insforge.database
    .from("tareas")
    .insert([
      {
        titulo: datos.titulo,
        detalle: datos.detalle,
        tipo: datos.tipo,
        estado: "pendiente",
        duracion_estimada_min: datos.duracion,
        paralelizable: datos.paralelizable,
        proyecto_id: datos.proyectoId,
        fecha_para: fechaParaTipo(datos.tipo),
      },
    ])
    .select("id");

  if (error) throw error;

  const id = (data as Array<{ id?: string }> | null)?.[0]?.id;
  if (!id) throw new Error("No se pudo guardar la tarea");

  return id;
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
      "Escríbeme una tarea y te la propongo antes de crearla.\n\n" +
        "· Confirmar: te enseño la tarea y espero tu «sí» (o «no» para descartarla).\n" +
        "· Proyectos: «crea el proyecto Kerbal» y «mete en el proyecto Kerbal la tarea …».\n" +
        "· Borrar: «elimina la tarea anterior», «elimina la tarea de comprar pilas» o «elimina tareas» y te pregunto de qué columna.\n" +
        "· Si no tengo claro dónde va una tarea, te pregunto: «hoy», «mañana», «esta semana» o un proyecto.",
    );
    return Response.json({ ok: true });
  }

  let pendiente: TareaPendiente | null = null;

  try {
    const listaProyectos = await cargarProyectos();
    const nombres = listaProyectos.map((p) => p.nombre);
    const estado = await obtenerEstado(chatId);
    const accion = estado?.accion ?? null;

    // ---------------------------------------------------------------
    // Conversaciones que dejamos abiertas en mensajes anteriores
    // ---------------------------------------------------------------
    if (accion === "confirmar_tarea") {
      const propuesta = leerPropuesta(estado?.datos ?? {});

      if (!propuesta) {
        await limpiarAccion(chatId);
        await enviarMensaje(
          chatId,
          "Se me ha perdido la tarea que iba a crear. Dímela otra vez.",
        );
        return Response.json({ ok: true });
      }

      if (respuestaNegativa(texto)) {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Vale, no la creo.");
        return Response.json({ ok: true, cancelada: true });
      }

      if (!respuestaAfirmativa(texto)) {
        await enviarMensaje(
          chatId,
          `No te he entendido. Responde «sí» o «no».\n\n${resumenPropuesta(propuesta)}`,
        );
        return Response.json({ ok: true, pregunta: true });
      }

      const id = await insertarTarea(propuesta);
      await limpiarAccion(chatId);
      await recordarUltimaTarea(chatId, id);

      const donde =
        propuesta.proyectoNombre ??
        (ETIQUETA_TIPO[propuesta.tipo] ?? propuesta.tipo);
      await enviarMensaje(chatId, `✅ Añadida a ${donde}: ${propuesta.titulo}`);
      return Response.json({ ok: true, creada: true });
    }

    if (accion === "proyecto_tarea") {
      if (respuestaNegativa(texto)) {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Vale, no añado nada.");
        return Response.json({ ok: true, cancelada: true });
      }

      const nombreProyecto = String(estado?.datos?.proyecto ?? "");
      const proyecto = buscarProyecto(nombreProyecto, listaProyectos);
      await limpiarAccion(chatId);

      if (!proyecto) {
        await enviarMensaje(
          chatId,
          `El proyecto «${nombreProyecto}» ya no existe. Dime «crea el proyecto ${nombreProyecto}» si quieres crearlo.`,
        );
        return Response.json({ ok: true });
      }

      const destino = interpretarDestinoRapido(texto, []);
      if (destino?.accion === "cancelar") {
        await enviarMensaje(chatId, "Vale, no añado nada.");
        return Response.json({ ok: true });
      }

      const clasificacion = await clasificarTarea(texto, nombres);
      await proponerTarea(chatId, {
        titulo: clasificacion.titulo,
        detalle: clasificacion.detalle,
        tipo: "proyecto",
        duracion: clasificacion.duracion_estimada_min,
        paralelizable: clasificacion.paralelizable,
        proyectoId: proyecto.id,
        proyectoNombre: proyecto.nombre,
      });
      return Response.json({ ok: true, pregunta: true, confirmar: true });
    }

    if (accion === "borrar_columna") {
      const destino = interpretarDestinoRapido(texto, []);

      if (destino?.accion === "cancelar") {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Vale, no borro nada.");
        return Response.json({ ok: true });
      }

      if (!destino || !["hoy", "manana", "semana"].includes(destino.accion)) {
        await enviarMensaje(chatId, pedirColumna());
        return Response.json({ ok: true, pregunta: true });
      }

      const tipo = destino.accion as Tipo;
      const tareas = await listarPendientes(tipo);

      if (tareas.length === 0) {
        await limpiarAccion(chatId);
        await enviarMensaje(
          chatId,
          `No hay tareas pendientes en ${ETIQUETA_TIPO[tipo]}.`,
        );
        return Response.json({ ok: true });
      }

      await guardarEstado(chatId, {
        accion: "borrar_elegir",
        datos: { ids: tareas.map((t) => t.id) },
      });
      await enviarMensaje(chatId, listadoParaBorrar(tareas));
      return Response.json({ ok: true, pregunta: true });
    }

    if (accion === "borrar_elegir") {
      const ids = Array.isArray(estado?.datos?.ids)
        ? (estado?.datos?.ids as string[])
        : [];
      const tareas = (await listarPendientesTodas()).filter((t) =>
        ids.includes(t.id),
      );

      const destino = interpretarDestinoRapido(texto, []);
      if (destino?.accion === "cancelar") {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Vale, no borro nada.");
        return Response.json({ ok: true });
      }

      if (tareas.length === 0) {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Esas tareas ya no existen.");
        return Response.json({ ok: true });
      }

      const elegida = elegirDeLista(texto, tareas);
      if (!elegida) {
        await enviarMensaje(
          chatId,
          `No sé cuál dices.\n\n${listadoParaBorrar(tareas)}`,
        );
        return Response.json({ ok: true, pregunta: true });
      }

      await borrarTarea(elegida.id);
      await limpiarAccion(chatId);
      await enviarMensaje(chatId, `🗑️ Eliminada: ${elegida.titulo}`);
      return Response.json({ ok: true, eliminada: true });
    }

    // ---------------------------------------------------------------
    // Órdenes explícitas: crear proyecto, meter tarea, borrar
    // ---------------------------------------------------------------
    const comando = parsearComando(texto);

    if (comando?.tipo === "crear_proyecto") {
      const existente = buscarProyecto(comando.nombre, listaProyectos);
      if (existente) {
        await enviarMensaje(
          chatId,
          `Ese proyecto ya existe: ${existente.nombre}.`,
        );
        return Response.json({ ok: true, comando: "crear_proyecto" });
      }

      const creado = await crearProyecto(comando.nombre);
      await enviarMensaje(
        chatId,
        `✅ Proyecto creado: ${creado.nombre}\nCuando quieras: «mete en el proyecto ${creado.nombre} la tarea …».`,
      );
      return Response.json({ ok: true, comando: "crear_proyecto" });
    }

    if (comando?.tipo === "anadir_a_proyecto") {
      const proyecto = buscarProyecto(comando.proyecto, listaProyectos);

      if (!proyecto) {
        await enviarMensaje(
          chatId,
          `No existe el proyecto «${comando.proyecto}» y no lo creo sin que me lo pidas.\nDime «crea el proyecto ${comando.proyecto}» y luego te pido la tarea.`,
        );
        return Response.json({ ok: true, comando: "anadir_a_proyecto" });
      }

      if (!comando.tarea) {
        await guardarEstado(chatId, {
          accion: "proyecto_tarea",
          datos: { proyecto: proyecto.nombre },
        });
        await enviarMensaje(chatId, `¿Qué tarea meto en ${proyecto.nombre}?`);
        return Response.json({ ok: true, pregunta: true });
      }

      const clasificacion = await clasificarTarea(comando.tarea, nombres);
      await proponerTarea(chatId, {
        titulo: clasificacion.titulo,
        detalle: clasificacion.detalle,
        tipo: "proyecto",
        duracion: clasificacion.duracion_estimada_min,
        paralelizable: clasificacion.paralelizable,
        proyectoId: proyecto.id,
        proyectoNombre: proyecto.nombre,
      });
      return Response.json({ ok: true, pregunta: true, confirmar: true });
    }

    if (comando?.tipo === "borrar_ultima") {
      const recordada = estado?.ultima_tarea_id
        ? await tareaPorId(estado.ultima_tarea_id)
        : null;
      const tarea = recordada ?? (await tareaMasReciente());

      if (!tarea) {
        await enviarMensaje(chatId, "No encuentro ninguna tarea que borrar.");
        return Response.json({ ok: true, comando: "borrar_ultima" });
      }

      await borrarTarea(tarea.id);
      await enviarMensaje(chatId, `🗑️ Eliminada: ${tarea.titulo}`);
      return Response.json({ ok: true, eliminada: true });
    }

    if (comando?.tipo === "borrar_tarea") {
      const buscado = normalizarNombre(comando.texto);
      const pendientes = await listarPendientesTodas();
      const coincidencias = pendientes.filter((t) =>
        normalizarNombre(t.titulo).includes(buscado),
      );

      if (coincidencias.length === 0) {
        await enviarMensaje(
          chatId,
          `No encuentro ninguna tarea pendiente con «${comando.texto}».`,
        );
        return Response.json({ ok: true, comando: "borrar_tarea" });
      }

      if (coincidencias.length === 1) {
        await borrarTarea(coincidencias[0].id);
        await enviarMensaje(
          chatId,
          `🗑️ Eliminada: ${coincidencias[0].titulo}`,
        );
        return Response.json({ ok: true, eliminada: true });
      }

      await guardarEstado(chatId, {
        accion: "borrar_elegir",
        datos: { ids: coincidencias.map((t) => t.id) },
      });
      await enviarMensaje(chatId, listadoParaBorrar(coincidencias));
      return Response.json({ ok: true, pregunta: true });
    }

    if (comando?.tipo === "borrar_generico") {
      const pendientes = await listarPendientesTodas();
      if (pendientes.length === 0) {
        await enviarMensaje(chatId, "No hay tareas pendientes que borrar.");
        return Response.json({ ok: true, comando: "borrar_generico" });
      }

      await guardarEstado(chatId, { accion: "borrar_columna", datos: {} });
      await enviarMensaje(chatId, pedirColumna());
      return Response.json({ ok: true, pregunta: true });
    }

    // ---------------------------------------------------------------
    // Tarea esperando destino
    // ---------------------------------------------------------------
    pendiente = await obtenerPendiente(chatId);

    if (pendiente) {
      const tituloPendiente = pendiente.titulo;
      const pendienteDetalle = pendiente.detalle;
      const pendienteDuracion = pendiente.duracion_estimada_min;
      const pendienteParalelizable = pendiente.paralelizable;
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
          `¿En qué proyecto la pongo?${nombres.length > 0 ? `\nProyectos: ${nombres.join(", ")}.` : ""}\nO dime «hoy» / «mañana» / «esta semana».`,
        );
        return Response.json({ ok: true, pregunta: true });
      }

      if (destino.accion === "proyecto" && destino.proyecto) {
        const proyecto = buscarProyecto(destino.proyecto, listaProyectos);
        if (!proyecto) {
          await enviarMensaje(
            chatId,
            `No existe el proyecto «${destino.proyecto}» y no lo creo sin que me lo pidas.\nDime «crea el proyecto ${destino.proyecto}» o elige «hoy» / «mañana» / «esta semana».`,
          );
          return Response.json({ ok: true, pregunta: true });
        }

        await borrarPendiente(pendiente.id);
        pendiente = null;
        await proponerTarea(chatId, {
          titulo: tituloPendiente,
          detalle: pendienteDetalle,
          tipo: "proyecto",
          duracion: pendienteDuracion,
          paralelizable: pendienteParalelizable,
          proyectoId: proyecto.id,
          proyectoNombre: proyecto.nombre,
        });
        return Response.json({ ok: true, pregunta: true, confirmar: true });
      }

      const tipo = destino.accion as Tipo;
      await borrarPendiente(pendiente.id);
      pendiente = null;
      await proponerTarea(chatId, {
        titulo: tituloPendiente,
        detalle: pendienteDetalle,
        tipo,
        duracion: pendienteDuracion,
        paralelizable: pendienteParalelizable,
        proyectoId: null,
        proyectoNombre: null,
      });
      return Response.json({ ok: true, pregunta: true, confirmar: true });
    }

    // ---------------------------------------------------------------
    // Nota nueva
    // ---------------------------------------------------------------
    const clasificacion = await clasificarTarea(texto, nombres);

    if (!clasificacion.destino_claro && !clasificacion.proyecto_sugerido) {
      await guardarPendiente(chatId, clasificacion, texto);
      await enviarMensaje(
        chatId,
        preguntaDestino(clasificacion.titulo, nombres),
      );
      return Response.json({ ok: true, pregunta: true });
    }

    // Los proyectos solo se crean si lo pides: aquí solo se busca uno existente.
    const proyecto = clasificacion.proyecto_sugerido
      ? buscarProyecto(clasificacion.proyecto_sugerido, listaProyectos)
      : undefined;

    await proponerTarea(chatId, {
      titulo: clasificacion.titulo,
      detalle: clasificacion.detalle,
      tipo: clasificacion.tipo,
      duracion: clasificacion.duracion_estimada_min,
      paralelizable: clasificacion.paralelizable,
      proyectoId: proyecto?.id ?? null,
      proyectoNombre: proyecto?.nombre ?? null,
    });

    return Response.json({ ok: true, pregunta: true, confirmar: true });
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
