import {
  clasificarTareas,
  interpretarDestino,
  interpretarEvento,
  interpretarRecordatorio,
} from "@/lib/ai";
import { parsearComando } from "@/lib/comandos";
import {
  interpretarCorreccion,
  interpretarCorrecciones,
  parsearBorradorTareas,
  type CambioPropuesta,
} from "@/lib/correccion";
import { hoyISO, mananaISO } from "@/lib/dates";
import { interpretarDestinoRapido, normalizarTexto } from "@/lib/destino";
import {
  CATEGORIAS_EVENTO,
  pareceEventoCalendario,
  type CategoriaEvento,
} from "@/lib/eventos";
import { guardarEvento, listarEventos } from "@/lib/eventosServer";
import {
  fechaCorta,
  fechaDeTexto,
  fechaLargaDia,
  horaDeTexto,
  rangoFechas,
  type RangoFechas,
} from "@/lib/fechas";
import {
  guardarEstado,
  limpiarAccion,
  obtenerEstado,
  recordarUltimaTarea,
} from "@/lib/estado";
import { insforgeServer } from "@/lib/insforge/server";
import { colorParaNombre } from "@/lib/palette";
import {
  actualizarRecordatorio,
  borradorRecordatorio,
  borrarRecordatorio,
  crearRecordatoriosTarea,
  esPeticionRecordatorio,
  fechaHoraLarga,
  guardarRecordatorio,
  listarRecordatoriosEntre,
  listarRecordatoriosPendientes,
  obtenerRecordatorio,
  parsearBorrador,
  type Recordatorio,
} from "@/lib/recordatorios";
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
  callback_query?: {
    id?: string;
    data?: string;
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
    };
  };
}

const ETIQUETA_TIPO: Record<string, string> = {
  hoy: "Hoy",
  manana: "Mañana",
  semana: "Esta semana",
  proyecto: "Proyectos futuros",
  programada: "Programada",
};

function fechaParaTipo(tipo: Tipo): string | null {
  if (tipo === "hoy") return hoyISO();
  if (tipo === "manana") return mananaISO();
  return null;
}

const ETIQUETA_RANGO: Record<RangoFechas, string> = {
  hoy: "hoy",
  manana: "mañana",
  semana: "esta semana",
  semana_que_viene: "la semana que viene",
  mes: "este mes",
  mes_que_viene: "el mes que viene",
  todo: "los próximos",
};

type Teclado = { inline_keyboard: Array<Array<Record<string, unknown>>> };

function botonesConfirmar(borrador?: string): Teclado {
  const fila: Array<Record<string, unknown>> = [
    { text: "❌ No, cancelar", callback_data: "propuesta:no" },
  ];

  // El botón copia una plantilla que se puede pegar en el campo de texto y
  // retocar antes de mandarla.
  if (borrador) {
    fila.push({ text: "✏️ Editar", copy_text: { text: borrador } });
  }

  fila.push({ text: "✅ Sí, crear", callback_data: "propuesta:si" });

  return { inline_keyboard: [fila] };
}

async function enviarMensaje(
  chatId: number | string,
  texto: string,
  opciones?: { botones?: boolean; borrador?: string },
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const respuesta = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: texto,
          ...(opciones?.botones
            ? { reply_markup: botonesConfirmar(opciones.borrador) }
            : {}),
        }),
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

async function responderCallback(
  id: string | undefined,
  texto: string,
  alerta = false,
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !id) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        callback_query_id: id,
        text: texto,
        show_alert: alerta,
      }),
    });
  } catch (error) {
    console.error("No se pudo responder al botón de Telegram", error);
  }
}

/** Quita los botones del mensaje ya contestado para que no se pulsen dos veces. */
async function quitarBotones(chatId: number | string, messageId: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      }),
    });
  } catch (error) {
    console.error("No se pudieron quitar los botones", error);
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

const TIPOS_VALIDOS: Tipo[] = [
  "hoy",
  "manana",
  "semana",
  "proyecto",
  "programada",
];

interface TareaPropuesta {
  clase: "tarea";
  titulo: string;
  detalle: string;
  tipo: Tipo;
  fecha: string | null;
  duracion: number | null;
  paralelizable: boolean;
  proyectoId: string | null;
  proyectoNombre: string | null;
}

interface RecordatorioPropuesto {
  clase: "recordatorio";
  /** Si existe, la propuesta edita ese recordatorio en vez de crear otro. */
  id?: string;
  titulo: string;
  detalle: string;
  recordarAt: string;
}

interface EventoPropuesto {
  clase: "evento";
  titulo: string;
  detalle: string;
  categoria: CategoriaEvento;
  fecha: string;
  hora: string | null;
}

type ItemPropuesta = TareaPropuesta | RecordatorioPropuesto | EventoPropuesto;

function respuestaAfirmativa(texto: string): boolean {
  if (/[👍✅👌🙌]/u.test(texto.trim())) return true;

  const limpio = normalizarTexto(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[!¡.]/g, "")
    .trim();

  // «sí, pero cámbiale el título» no es un sí: primero se corrige.
  if (
    /\b(pero|aunque|mejor|cambia|cambiar|pon|ponle|espera|en vez)\b/.test(limpio)
  ) {
    return false;
  }

  return /^(si|sip|vale|ok|okey|okay|creala|crear|adelante|claro|hazlo|confirmo|perfecto|correcto|exacto|de acuerdo|venga|dale)(\s+(por favor|gracias|venga|dale|ya))?$/.test(
    limpio,
  );
}

function respuestaNegativa(texto: string): boolean {
  const limpio = normalizarTexto(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[!¡.]/g, "")
    .trim();

  return /^(no|nope|cancela|cancelar|mejor no|nada|dejalo|dejalo estar|olvidalo|no gracias|para nada|no la crees|no lo hagas)$/.test(
    limpio,
  );
}

function leerTareaPropuesta(
  datos: Record<string, unknown>,
): TareaPropuesta | null {
  const titulo = typeof datos.titulo === "string" ? datos.titulo : "";
  const tipo = datos.tipo as Tipo;

  if (!titulo || !TIPOS_VALIDOS.includes(tipo)) return null;

  return {
    clase: "tarea",
    titulo,
    detalle: typeof datos.detalle === "string" ? datos.detalle : "",
    tipo,
    fecha:
      typeof datos.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)
        ? datos.fecha
        : null,
    duracion: typeof datos.duracion === "number" ? datos.duracion : null,
    paralelizable: datos.paralelizable === true,
    proyectoId:
      typeof datos.proyectoId === "string" ? datos.proyectoId : null,
    proyectoNombre:
      typeof datos.proyectoNombre === "string" ? datos.proyectoNombre : null,
  };
}

function leerItem(valor: unknown): ItemPropuesta | null {
  if (!valor || typeof valor !== "object") return null;
  const datos = valor as Record<string, unknown>;

  if (datos.clase === "recordatorio") {
    const titulo = typeof datos.titulo === "string" ? datos.titulo : "";
    const recordarAt =
      typeof datos.recordarAt === "string" ? datos.recordarAt : "";
    const fecha = new Date(recordarAt);

    if (!titulo || Number.isNaN(fecha.getTime())) return null;

    return {
      clase: "recordatorio",
      ...(typeof datos.id === "string" ? { id: datos.id } : {}),
      titulo,
      detalle: typeof datos.detalle === "string" ? datos.detalle : "",
      recordarAt: fecha.toISOString(),
    };
  }

  if (datos.clase === "evento") {
    const titulo = typeof datos.titulo === "string" ? datos.titulo : "";
    const fecha = typeof datos.fecha === "string" ? datos.fecha : "";
    const categoria = datos.categoria as CategoriaEvento;

    if (
      !titulo ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      !(categoria in CATEGORIAS_EVENTO)
    ) {
      return null;
    }

    return {
      clase: "evento",
      titulo,
      detalle: typeof datos.detalle === "string" ? datos.detalle : "",
      categoria,
      fecha,
      hora:
        typeof datos.hora === "string" && /^\d{2}:\d{2}$/.test(datos.hora)
          ? datos.hora
          : null,
    };
  }

  return leerTareaPropuesta(datos);
}

/** Acepta el formato nuevo (items) y las propuestas antiguas de una tarea. */
function leerItems(datos: Record<string, unknown>): ItemPropuesta[] {
  if (Array.isArray(datos.items)) {
    return datos.items
      .map(leerItem)
      .filter((item): item is ItemPropuesta => item !== null);
  }

  const unica = leerTareaPropuesta(datos);
  return unica ? [unica] : [];
}

function resumenItem(item: ItemPropuesta): string {
  if (item.clase === "recordatorio") {
    return `• ${item.id ? "✏️ " : "⏰ "}${item.titulo} — ${fechaHoraLarga(item.recordarAt)}`;
  }

  if (item.clase === "evento") {
    const categoria = CATEGORIAS_EVENTO[item.categoria].etiqueta;
    return `• 📅 ${item.titulo} — ${fechaLargaDia(item.fecha)}${item.hora ? ` a las ${item.hora}` : ""} · ${categoria}`;
  }

  const donde = item.proyectoNombre ?? ETIQUETA_TIPO[item.tipo] ?? item.tipo;
  const extras = [donde];
  if (item.tipo === "programada" && item.fecha) {
    extras.push(`${fechaCorta(item.fecha)} (aviso el día antes y ese día a las 9:00)`);
  }
  if (item.duracion) extras.push(`${item.duracion} min`);
  if (item.paralelizable) extras.push("paralelizable");

  return `• ${item.titulo} · ${extras.join(" · ")}`;
}

function preguntaDestinoLote(
  items: ItemPropuesta[],
  proyectos: string[],
): string {
  const lista = items.map((item) => `• ${item.titulo}`).join("\n");
  const extra =
    proyectos.length > 0 ? `\nProyectos: ${proyectos.join(", ")}.` : "";

  return `Tengo ${items.length} tareas:\n${lista}\n\n¿Dónde las pongo? «hoy», «mañana», «esta semana» o un proyecto.${extra}\nSi no las quieres, dime «cancela».`;
}

function textoBorrador(item: ItemPropuesta): string | undefined {
  return item.clase === "recordatorio"
    ? borradorRecordatorio(item.titulo, item.recordarAt)
    : undefined;
}

/** Plantilla de una tarea con los campos que entiende el bot al pegarla. */
function borradorTarea(item: TareaPropuesta): string {
  const cuando =
    item.tipo === "proyecto"
      ? "proyecto"
      : item.tipo === "programada"
        ? "programada"
        : item.tipo === "semana"
          ? "esta semana"
          : item.tipo === "manana"
            ? "mañana"
            : "hoy";

  return [
    `Título: ${item.titulo}`,
    `Cuándo: ${cuando}`,
    `Fecha: ${item.fecha ?? "sin fecha"}`,
    `Duración: ${item.duracion ? `${item.duracion} min` : "sin duración"}`,
    `Proyecto: ${item.proyectoNombre ?? "sin proyecto"}`,
  ].join(" | ");
}

function borradorDe(items: ItemPropuesta[]): string | undefined {
  if (items.length === 0) return undefined;

  if (items.every((item) => item.clase === "tarea")) {
    const texto = (items as TareaPropuesta[]).map(borradorTarea).join("\n");
    // Telegram limita copy_text a 256 caracteres.
    return texto.length <= 256 ? texto : undefined;
  }

  const unico = items.length === 1 ? items[0] : null;
  return unico ? textoBorrador(unico) : undefined;
}

/** Aplica un cambio pedido por el usuario sobre la propuesta pendiente. */
function aplicarCorreccion(
  propuesta: TareaPropuesta,
  cambio: CambioPropuesta,
  proyectos: Proyecto[],
): TareaPropuesta {
  let tipo = cambio.tipo ?? propuesta.tipo;
  let proyectoId = propuesta.proyectoId;
  let proyectoNombre = propuesta.proyectoNombre;

  if (cambio.proyectoNombre !== undefined) {
    const proyecto = cambio.proyectoNombre
      ? buscarProyecto(cambio.proyectoNombre, proyectos)
      : undefined;
    proyectoId = proyecto?.id ?? null;
    proyectoNombre = proyecto?.nombre ?? null;
    if (proyecto) tipo = "proyecto";
  } else if (cambio.tipo && cambio.tipo !== "proyecto") {
    proyectoId = null;
    proyectoNombre = null;
  }

  return {
    ...propuesta,
    titulo: cambio.titulo ?? propuesta.titulo,
    tipo,
    fecha:
      cambio.fecha !== undefined ? cambio.fecha : propuesta.fecha,
    proyectoId,
    proyectoNombre,
    duracion:
      cambio.duracion !== undefined ? cambio.duracion : propuesta.duracion,
  };
}

/** No crea nada: guarda la propuesta y espera un «sí» explícito. */
async function proponerItems(
  chatId: number | string,
  items: ItemPropuesta[],
  nota?: string,
): Promise<void> {
  await guardarEstado(chatId, {
    accion: "confirmar_tarea",
    datos: { items },
  });

  const unico = items.length === 1 ? items[0] : null;
  const pregunta =
    items.length === 1 ? "¿Creo esto?" : `¿Creo estas ${items.length} cosas?`;
  const ayuda =
    unico?.clase === "recordatorio"
      ? unico.id
        ? "Responde «sí» para guardar el cambio o «no» para dejarlo como estaba."
        : "Responde «sí» o «no», o pulsa «Editar» para copiar el recordatorio y cambiar lo que quieras."
      : unico?.clase === "evento"
        ? "Responde «sí» para añadirlo al calendario o «no» para descartarlo."
        : unico
          ? "Responde «sí» o «no», pulsa ✏️ Editar para copiar la plantilla y retocarla, o dime el cambio: «el título es …», «mejor mañana», «en el proyecto …», «cambia la duración a 45 min»."
          : "Responde «sí» o «no», o pulsa ✏️ Editar para copiar una plantilla con título, cuándo, duración y proyecto y retocarla. También valen «mates 30 min y dibujo 1h 20», «la primera 20 y la segunda 40» o «todas 30 minutos». «cancela» para dejarlo.";

  const listado = items.map(resumenItem).join("\n");

  await enviarMensaje(
    chatId,
    `${nota ? `${nota}\n\n` : ""}${pregunta}\n\n${listado}\n\n${ayuda}`,
    { botones: true, borrador: borradorDe(items) },
  );
}

async function proponerTarea(
  chatId: number | string,
  tarea: Omit<TareaPropuesta, "clase">,
  nota?: string,
): Promise<void> {
  await proponerItems(chatId, [{ clase: "tarea", ...tarea }], nota);
}

async function proponerRecordatorio(
  chatId: number | string,
  titulo: string,
  detalle: string,
  recordarAt: string,
  nota?: string,
  id?: string,
): Promise<void> {
  await proponerItems(
    chatId,
    [{ clase: "recordatorio", ...(id ? { id } : {}), titulo, detalle, recordarAt }],
    nota,
  );
}

async function proponerEvento(
  chatId: number | string,
  evento: Omit<EventoPropuesto, "clase">,
  nota?: string,
): Promise<void> {
  await proponerItems(chatId, [{ clase: "evento", ...evento }], nota);
}

function fechaCortaFinDeAnio(): string {
  return `${Number(hoyISO().slice(0, 4)) + 1}-12-31`;
}

function formatearRecordatorios(lista: Recordatorio[]): string {
  return lista
    .map((recordatorio, indice) => {
      const atrasado = new Date(recordatorio.recordar_at).getTime() < Date.now();
      return `${indice + 1}. ${recordatorio.titulo} — ${fechaHoraLarga(recordatorio.recordar_at)}${atrasado ? " (atrasado)" : ""}`;
    })
    .join("\n");
}

async function recordatoriosDelRango(rango: RangoFechas): Promise<Recordatorio[]> {
  if (rango === "todo") return listarRecordatoriosPendientes(100);

  const { desde, hasta } = rangoFechas(rango);
  return listarRecordatoriosEntre(desde, hasta);
}

const PALABRAS_SIN_TITULO = new Set([
  "hoy",
  "manana",
  "esta",
  "este",
  "semana",
  "mes",
  "que",
  "viene",
  "proximo",
  "siguiente",
  "las",
  "los",
  "para",
  "del",
  "dia",
  "recordatorio",
  "alarma",
  "aviso",
]);

function puntuacionRecordatorio(
  texto: string,
  recordatorio: Recordatorio,
): number {
  const titulo = normalizarNombre(recordatorio.titulo);
  const palabras = normalizarNombre(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3 && !PALABRAS_SIN_TITULO.has(p));

  return palabras.filter((palabra) => titulo.includes(palabra)).length;
}

/** Los candidatos con más palabras en común; evita que «prueba» empate todo. */
function filtrarRecordatorios(
  texto: string,
  lista: Recordatorio[],
): Recordatorio[] {
  const puntuados = lista
    .map((recordatorio) => ({
      recordatorio,
      puntos: puntuacionRecordatorio(texto, recordatorio),
    }))
    .filter((item) => item.puntos > 0);

  const maximo = Math.max(0, ...puntuados.map((item) => item.puntos));
  return puntuados
    .filter((item) => item.puntos === maximo)
    .map((item) => item.recordatorio);
}

function elegirRecordatorio(
  texto: string,
  lista: Recordatorio[],
): Recordatorio | null {
  const numero = texto.trim().match(/^\d{1,2}$/);
  if (numero) return lista[Number(numero[0]) - 1] ?? null;

  const buscado = normalizarNombre(texto);
  if (!buscado) return null;

  return (
    lista.find((r) => normalizarNombre(r.titulo) === buscado) ??
    filtrarRecordatorios(texto, lista)[0] ??
    null
  );
}

async function responderListaRecordatorios(
  chatId: number | string,
  rango: RangoFechas,
): Promise<void> {
  const lista = await recordatoriosDelRango(rango);

  if (lista.length === 0) {
    await enviarMensaje(
      chatId,
      `No tienes recordatorios pendientes ${ETIQUETA_RANGO[rango]}.\nPídeme uno: «recuérdame mañana a las 9:30 llamar al banco».`,
    );
    return;
  }

  await enviarMensaje(
    chatId,
    `⏰ Recordatorios ${ETIQUETA_RANGO[rango]} (${lista.length})\n\n${formatearRecordatorios(lista)}\n\nPuedes decir «cancela el recordatorio 2» o «edita el recordatorio 2».`,
  );
}

async function iniciarCancelacionRecordatorio(
  chatId: number | string,
  rango: RangoFechas,
  texto: string | null,
): Promise<void> {
  const lista = await recordatoriosDelRango(rango);

  if (lista.length === 0) {
    await enviarMensaje(
      chatId,
      `No hay recordatorios pendientes ${ETIQUETA_RANGO[rango]} que cancelar.`,
    );
    return;
  }

  const candidatos = texto ? filtrarRecordatorios(texto, lista) : lista;

  if (texto && candidatos.length === 0) {
    await enviarMensaje(
      chatId,
      `No encuentro «${texto}» ${ETIQUETA_RANGO[rango]}.\n\n${formatearRecordatorios(lista)}\n\nDime el número del que quieres cancelar.`,
    );
    return;
  }

  if (candidatos.length === 1) {
    await borrarRecordatorio(candidatos[0].id);
    await enviarMensaje(
      chatId,
      `🗑️ Cancelado: ${candidatos[0].titulo} — ${fechaHoraLarga(candidatos[0].recordar_at)}`,
    );
    return;
  }

  await guardarEstado(chatId, {
    accion: "recordatorio_cancelar_elegir",
    datos: { ids: candidatos.map((r) => r.id) },
  });
  await enviarMensaje(
    chatId,
    `¿Cuál cancelo?\n\n${formatearRecordatorios(candidatos)}\n\nDime el número o parte del título. «cancela» para dejarlo.`,
  );
}

function textoDelCambio(texto: string, titulo: string): string {
  const palabras = new Set(
    normalizarNombre(titulo)
      .split(/[^a-z0-9]+/)
      .filter((palabra) => palabra.length > 2),
  );

  const resto = texto
    .split(/\s+/)
    .filter((palabra) => !palabras.has(normalizarNombre(palabra)))
    .join(" ")
    .trim();

  return resto || texto;
}

async function interpretarCambioRecordatorio(
  chatId: number | string,
  recordatorio: Recordatorio,
  texto: string,
): Promise<void> {
  const cambio = textoDelCambio(texto, recordatorio.titulo);
  const cambiaTitulo =
    /\b(?:titulo|nombre|llam(?:arlo|arla|ar)|ponle|que\s+se\s+llame)\b/i.test(
      cambio,
    );
  const interpretado = await interpretarRecordatorio(cambio, {
    titulo: recordatorio.titulo,
    detalle: recordatorio.detalle,
    recordarAt: recordatorio.recordar_at,
  });

  if (!interpretado.recordarAt) {
    await enviarMensaje(
      chatId,
      "No he sabido qué cambiar. Dime, por ejemplo, «a las 10:30», «mañana a las 9» o «el 8 de diciembre a las 18:00».",
    );
    return;
  }

  await limpiarAccion(chatId);
  await proponerRecordatorio(
    chatId,
    cambiaTitulo ? interpretado.titulo : recordatorio.titulo,
    cambiaTitulo ? interpretado.detalle : recordatorio.detalle,
    interpretado.recordarAt,
    "✏️ He preparado el cambio.",
    recordatorio.id,
  );
}

async function iniciarEdicionRecordatorio(
  chatId: number | string,
  rango: RangoFechas,
  texto: string | null,
): Promise<void> {
  const lista = await recordatoriosDelRango(rango);

  if (lista.length === 0) {
    await enviarMensaje(
      chatId,
      `No hay recordatorios pendientes ${ETIQUETA_RANGO[rango]} que editar.`,
    );
    return;
  }

  const candidatos = texto ? filtrarRecordatorios(texto, lista) : lista;

  if (texto && candidatos.length === 1) {
    await interpretarCambioRecordatorio(chatId, candidatos[0], texto);
    return;
  }

  if (candidatos.length === 1) {
    await guardarEstado(chatId, {
      accion: "recordatorio_editar_cambio",
      datos: { id: candidatos[0].id },
    });
    await enviarMensaje(
      chatId,
      `Vas a editar «${candidatos[0].titulo}» (${fechaHoraLarga(candidatos[0].recordar_at)}).\n¿Qué cambio? Dime «a las 10:30», «mañana a las 9» o «el 8 de diciembre a las 18:00».`,
    );
    return;
  }

  await guardarEstado(chatId, {
    accion: "recordatorio_editar_elegir",
    datos: { ids: candidatos.map((r) => r.id) },
  });
  await enviarMensaje(
    chatId,
    `¿Cuál quieres editar?\n\n${formatearRecordatorios(candidatos)}\n\nDime el número o parte del título. «cancela» para dejarlo.`,
  );
}

async function responderCalendario(
  chatId: number | string,
  rango: RangoFechas,
  categoria: CategoriaEvento | null,
  texto: string,
): Promise<void> {
  const fechaSuelta = rango === "todo" ? fechaDeTexto(texto) : null;
  const rangoFinal: RangoFechas = fechaSuelta ? "todo" : rango;
  const { desde, hasta } = fechaSuelta
    ? { desde: fechaSuelta, hasta: fechaSuelta }
    : rangoFinal === "todo"
      ? { desde: hoyISO(), hasta: fechaCortaFinDeAnio() }
      : rangoFechas(rangoFinal);

  const eventos = await listarEventos(desde, hasta, categoria);
  const nombreCategoria = categoria
    ? CATEGORIAS_EVENTO[categoria].etiqueta.toLowerCase()
    : "eventos";

  if (eventos.length === 0) {
    await enviarMensaje(
      chatId,
      `No hay ${nombreCategoria} ${fechaSuelta ? `el ${fechaCorta(fechaSuelta)}` : ETIQUETA_RANGO[rangoFinal]}.`,
    );
    return;
  }

  const lineas = eventos
    .map(
      (evento, indice) =>
        `${indice + 1}. ${fechaLargaDia(evento.fecha)}${evento.hora ? ` a las ${evento.hora}` : ""} — ${evento.titulo} · ${CATEGORIAS_EVENTO[evento.categoria].etiqueta}`,
    )
    .join("\n");

  await enviarMensaje(
    chatId,
    `📅 ${nombreCategoria[0].toUpperCase() + nombreCategoria.slice(1)} ${fechaSuelta ? `el ${fechaCorta(fechaSuelta)}` : ETIQUETA_RANGO[rangoFinal]} (${eventos.length})\n\n${lineas}`,
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
  fecha: string | null;
  duracion: number | null;
  paralelizable: boolean;
  proyectoId: string | null;
  chatId: number | string;
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
        fecha_para: datos.fecha ?? fechaParaTipo(datos.tipo),
      },
    ])
    .select("id");

  if (error) throw error;

  const id = (data as Array<{ id?: string }> | null)?.[0]?.id;
  if (!id) throw new Error("No se pudo guardar la tarea");

  if (datos.tipo === "programada" && datos.fecha) {
    await crearRecordatoriosTarea({
      titulo: datos.titulo,
      detalle: datos.detalle,
      fecha: datos.fecha,
      chatId: datos.chatId,
    });
  }

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

  let chatId = update.message?.chat?.id ?? update.edited_message?.chat?.id;
  let texto = (
    update.message?.text ?? update.edited_message?.text
  )?.trim();

  // Botones «Sí / No» del mensaje de confirmación.
  const callback = update.callback_query;
  if (callback) {
    const chatCallback = callback.message?.chat?.id;
    const dato = callback.data ?? "";

    if (!chatCallback || !/^(?:tarea|propuesta):(si|no)$/.test(dato)) {
      await responderCallback(callback.id, "No sé qué hacer con eso.");
      return Response.json({ ok: true, ignored: "callback desconocido" });
    }

    const estadoCallback = await obtenerEstado(chatCallback);
    if (estadoCallback?.accion !== "confirmar_tarea") {
      await responderCallback(
        callback.id,
        "Esa propuesta ya está cerrada.",
        true,
      );
      return Response.json({ ok: true, ignored: "callback caducado" });
    }

    const confirmar = dato.endsWith(":si");
    await responderCallback(
      callback.id,
      confirmar ? "Vale, la creo." : "Vale, no la creo.",
    );

    if (callback.message?.message_id) {
      await quitarBotones(chatCallback, callback.message.message_id);
    }

    chatId = chatCallback;
    texto = confirmar ? "sí" : "no";
  }

  if (!chatId || !texto) {
    return Response.json({ ok: true, ignored: "sin texto" });
  }

  if (/^\/(start|help)\b/.test(texto)) {
    await enviarMensaje(
      chatId,
      "Escríbeme una tarea y te la propongo antes de crearla.\n\n" +
        "· Confirmar: te enseño lo que he entendido y espero tu «sí», «no» o un cambio.\n" +
        "· Varias tareas: «comprar pan; llamar a Ana; recoger el paquete» y te las propongo todas juntas.\n" +
        "· Recordatorios: «recuérdame el viernes a las 18:00 llamar a Ana», «créame una alarma mañana a las 8», «ponme un recordatorio» o «avísame el lunes a las 9». Te aviso por aquí a esa hora.\n" +
        "· Ver recordatorios: «mis recordatorios», «dime los recordatorios de hoy» o «los de esta semana».\n" +
        "· Cancelar o editar: «cancela el recordatorio de hoy», «cancela el del banco», «edita el recordatorio de mañana» y te pregunto cuál y qué cambio.\n" +
        "· Calendario: «el 8 de diciembre tengo un examen de cálculo», «apunta la entrega del proyecto el 20/12» o «el viernes 20 a las 10:00 tengo una reunión».\n" +
        "· Consultar calendario: «dime los exámenes de la semana que viene», «¿qué entregas tengo este mes?».\n" +
        "· Tareas lejanas: «quiero una tarea para el día 8 del mes que viene», «para dentro de dos semanas» o «dentro de un mes»; te aviso el día antes y el mismo día a las 9:00.\n" +
        "· Proyectos: «crea el proyecto Kerbal» y «mete en el proyecto Kerbal la tarea …».\n" +
        "· Borrar: «elimina la tarea anterior», «elimina la tarea de comprar pilas» o «elimina tareas» y te pregunto de qué columna.\n" +
        "· Si no tengo claro dónde va una tarea, te pregunto: «hoy», «mañana», «esta semana» o un proyecto.",
    );
    return Response.json({ ok: true });
  }

  // Órdenes rápidas de recordatorios y calendario: funcionan aunque haya
  // una propuesta abierta.
  const comandoRapido = parsearComando(texto);

  try {
    if (comandoRapido?.tipo === "listar_recordatorios") {
      await responderListaRecordatorios(chatId, comandoRapido.rango);
      return Response.json({ ok: true, recordatorios: true });
    }

    if (comandoRapido?.tipo === "cancelar_recordatorio") {
      await iniciarCancelacionRecordatorio(
        chatId,
        comandoRapido.rango,
        comandoRapido.texto,
      );
      return Response.json({ ok: true, recordatorio: "cancelar" });
    }

    if (comandoRapido?.tipo === "editar_recordatorio") {
      await iniciarEdicionRecordatorio(
        chatId,
        comandoRapido.rango,
        comandoRapido.texto,
      );
      return Response.json({ ok: true, recordatorio: "editar" });
    }

    if (comandoRapido?.tipo === "consultar_calendario") {
      await responderCalendario(
        chatId,
        comandoRapido.rango,
        comandoRapido.categoria,
        comandoRapido.texto,
      );
      return Response.json({ ok: true, calendario: true });
    }
  } catch (error) {
    console.error("No se pudo ejecutar la orden rápida", error);
    await enviarMensaje(
      chatId,
      "No he podido consultar esa información. Inténtalo otra vez.",
    );
    return Response.json({ ok: true, error: "orden rápida" });
  }

  let pendiente: TareaPendiente | null = null;

  try {
    const listaProyectos = await cargarProyectos();
    const nombres = listaProyectos.map((p) => p.nombre);
    const estado = await obtenerEstado(chatId);
    const accion = estado?.accion ?? null;

    // ---------------------------------------------------------------
    // Elegir recordatorio para cancelar o editar
    // ---------------------------------------------------------------
    if (accion === "recordatorio_cancelar_elegir") {
      if (respuestaNegativa(texto)) {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Vale, no cancelo nada.");
        return Response.json({ ok: true, cancelada: true });
      }

      const ids = Array.isArray(estado?.datos?.ids)
        ? (estado.datos.ids as string[])
        : [];
      const pendientes = await listarRecordatoriosPendientes(150);
      const lista = pendientes.filter((r) => ids.includes(r.id));
      const elegido = elegirRecordatorio(texto, lista);

      if (!elegido) {
        await enviarMensaje(
          chatId,
          `No sé cuál dices.\n\n${formatearRecordatorios(lista)}\n\nDime el número o parte del título.`,
        );
        return Response.json({ ok: true, pregunta: true });
      }

      await borrarRecordatorio(elegido.id);
      await limpiarAccion(chatId);
      await enviarMensaje(
        chatId,
        `🗑️ Cancelado: ${elegido.titulo} — ${fechaHoraLarga(elegido.recordar_at)}`,
      );
      return Response.json({ ok: true, eliminada: true });
    }

    if (accion === "recordatorio_editar_elegir") {
      if (respuestaNegativa(texto)) {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Vale, no edito nada.");
        return Response.json({ ok: true, cancelada: true });
      }

      const ids = Array.isArray(estado?.datos?.ids)
        ? (estado.datos.ids as string[])
        : [];
      const pendientes = await listarRecordatoriosPendientes(150);
      const lista = pendientes.filter((r) => ids.includes(r.id));
      const elegido = elegirRecordatorio(texto, lista);

      if (!elegido) {
        await enviarMensaje(
          chatId,
          `No sé cuál dices.\n\n${formatearRecordatorios(lista)}\n\nDime el número o parte del título.`,
        );
        return Response.json({ ok: true, pregunta: true });
      }

      await guardarEstado(chatId, {
        accion: "recordatorio_editar_cambio",
        datos: { id: elegido.id },
      });
      await enviarMensaje(
        chatId,
        `Vas a editar «${elegido.titulo}» (${fechaHoraLarga(elegido.recordar_at)}).\n¿Qué cambio? Dime «a las 10:30», «mañana a las 9» o «el 8 de diciembre a las 18:00».`,
      );
      return Response.json({ ok: true, pregunta: true });
    }

    if (accion === "recordatorio_editar_cambio") {
      if (respuestaNegativa(texto)) {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Vale, no cambio nada.");
        return Response.json({ ok: true, cancelada: true });
      }

      const id = String(estado?.datos?.id ?? "");
      const recordatorio = id ? await obtenerRecordatorio(id) : null;

      if (!recordatorio) {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Ese recordatorio ya no existe.");
        return Response.json({ ok: true });
      }

      await interpretarCambioRecordatorio(chatId, recordatorio, texto);
      return Response.json({ ok: true, pregunta: true, confirmar: true });
    }

    if (accion === "evento_cuando") {
      if (respuestaNegativa(texto)) {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Vale, no añado el evento.");
        return Response.json({ ok: true, cancelada: true });
      }

      const original = String(estado?.datos?.texto ?? "").trim();
      const interpretado = await interpretarEvento(
        `${original}\nCuándo: ${texto}`,
      );

      if (!interpretado.fecha) {
        await enviarMensaje(
          chatId,
          "No he sabido qué día es. Dime, por ejemplo, «el 8 de diciembre» o «el viernes 20 a las 10:00».",
        );
        return Response.json({ ok: true, pregunta: true });
      }

      await limpiarAccion(chatId);
      await proponerEvento(chatId, {
        titulo: interpretado.titulo,
        detalle: interpretado.detalle,
        categoria: interpretado.categoria,
        fecha: interpretado.fecha,
        hora: interpretado.hora,
      });
      return Response.json({ ok: true, pregunta: true, confirmar: true });
    }

    // ---------------------------------------------------------------
    // Conversaciones que dejamos abiertas en mensajes anteriores
    // ---------------------------------------------------------------
    if (accion === "confirmar_tarea") {
      const comandoNuevo = parsearComando(texto);

      if (comandoNuevo) {
        // Otra orden mientras hay una propuesta abierta: se descarta y manda
        // el comando (abajo se procesa como siempre).
        await limpiarAccion(chatId);
      } else {
        const items = leerItems(estado?.datos ?? {});

        if (items.length === 0) {
          await limpiarAccion(chatId);
          await enviarMensaje(
            chatId,
            "Se me ha perdido lo que iba a crear. Dímelo otra vez.",
          );
          return Response.json({ ok: true });
        }

        if (respuestaNegativa(texto)) {
          await limpiarAccion(chatId);
          await enviarMensaje(chatId, "Vale, no creo nada.");
          return Response.json({ ok: true, cancelada: true });
        }

        if (!respuestaAfirmativa(texto)) {
          const unico = items.length === 1 ? items[0] : null;
          let actualizados: ItemPropuesta[] | null = null;

          // Plantilla copiada con «Editar» y pegada de vuelta.
          const borradorPegado = parsearBorradorTareas(texto);

          if (borradorPegado) {
            const tareas = items as TareaPropuesta[];

            if (
              !items.every((item) => item.clase === "tarea") ||
              borradorPegado.length !== items.length
            ) {
              await enviarMensaje(
                chatId,
                `El borrador trae ${borradorPegado.length} línea(s) y hay ${items.length} propuesta(s). Deja una línea por tarea y vuelve a pegarlo.`,
                { botones: true, borrador: borradorDe(items) },
              );
              return Response.json({ ok: true, pregunta: true });
            }

            const propuestos: ItemPropuesta[] = [];
            let proyectoInexistente: string | null = null;

            for (let indice = 0; indice < tareas.length; indice += 1) {
              const tarea = tareas[indice];
              const borrador = borradorPegado[indice];
              const proyecto = borrador.proyectoNombre
                ? buscarProyecto(borrador.proyectoNombre, listaProyectos)
                : undefined;

              if (borrador.proyectoNombre && !proyecto) {
                proyectoInexistente = borrador.proyectoNombre;
                break;
              }

              const tipo: Tipo = proyecto
                ? "proyecto"
                : (borrador.tipo ??
                  (borrador.proyectoNombre === null && tarea.tipo === "proyecto"
                    ? "hoy"
                    : tarea.tipo));

              propuestos.push({
                ...tarea,
                titulo: borrador.titulo ?? tarea.titulo,
                tipo,
                fecha:
                  borrador.fecha !== undefined
                    ? borrador.fecha
                    : tipo === "programada"
                      ? tarea.fecha
                      : null,
                duracion:
                  "duracion" in borrador
                    ? (borrador.duracion ?? null)
                    : tarea.duracion,
                proyectoId:
                  proyecto?.id ?? (tipo === "proyecto" ? tarea.proyectoId : null),
                proyectoNombre:
                  proyecto?.nombre ??
                  (tipo === "proyecto" ? tarea.proyectoNombre : null),
              });
            }

            if (proyectoInexistente) {
              await enviarMensaje(
                chatId,
                `No existe el proyecto «${proyectoInexistente}». Dime «crea el proyecto ${proyectoInexistente}» o cambia esa línea del borrador.`,
                { botones: true, borrador: borradorDe(items) },
              );
              return Response.json({ ok: true, pregunta: true });
            }

            await proponerItems(
              chatId,
              propuestos,
              "✏️ He aplicado tu borrador.",
            );
            return Response.json({
              ok: true,
              pregunta: true,
              confirmar: true,
              actualizada: true,
            });
          }

          // Varias tareas: cambios por tarea («mates 30 min y dibujo 1h 20»).
          if (items.length > 1 && items.every((item) => item.clase === "tarea")) {
            const tareas = items as TareaPropuesta[];
            const cambios = interpretarCorrecciones(texto, tareas, nombres);

            if (cambios.length > 0) {
              actualizados = tareas.map((tarea, indice) => {
                const suyo = cambios.filter(
                  (cambio) => cambio.indice === indice || cambio.indice === -1,
                );

                return suyo.reduce(
                  (resultado, cambio) =>
                    aplicarCorreccion(resultado, cambio.cambio, listaProyectos),
                  tarea,
                );
              });
            }
          } else if (unico?.clase === "tarea") {
            const cambio = interpretarCorreccion(texto, unico, nombres);
            if (cambio) {
              actualizados = [
                aplicarCorreccion(unico, cambio, listaProyectos),
              ];
            }
          } else if (unico?.clase === "recordatorio") {
            const interpretado = await interpretarRecordatorio(texto, {
              titulo: unico.titulo,
              detalle: unico.detalle,
              recordarAt: unico.recordarAt,
            });

            if (interpretado.recordarAt) {
              actualizados = [
                {
                  ...unico,
                  titulo: interpretado.titulo,
                  detalle: interpretado.detalle,
                  recordarAt: interpretado.recordarAt,
                },
              ];
            }
          } else if (unico?.clase === "evento") {
            const interpretado = await interpretarEvento(texto);

            if (interpretado.fecha) {
              actualizados = [
                {
                  ...unico,
                  titulo: interpretado.titulo,
                  detalle: interpretado.detalle,
                  categoria: interpretado.categoria,
                  fecha: interpretado.fecha,
                  hora: interpretado.hora,
                },
              ];
            }
          }

          if (actualizados) {
            await proponerItems(
              chatId,
              actualizados,
              "✏️ He actualizado la propuesta.",
            );
            return Response.json({
              ok: true,
              pregunta: true,
              confirmar: true,
              actualizada: true,
            });
          }

          await enviarMensaje(
            chatId,
            `No te he entendido. Responde «sí» o «no», o dime qué cambio: «el título es …», «mejor mañana», «en el proyecto …» o «cambia la duración a 45 min».\n\n${items
              .map(resumenItem)
              .join("\n")}`,
            { botones: true, borrador: borradorDe(items) },
          );
          return Response.json({ ok: true, pregunta: true });
        }

        const tareasCreadas: string[] = [];

        for (const item of items) {
          if (item.clase === "tarea") {
            const id = await insertarTarea({ ...item, chatId });
            tareasCreadas.push(id);
          } else if (item.clase === "recordatorio") {
            if (item.id) {
              await actualizarRecordatorio(item.id, {
                titulo: item.titulo,
                detalle: item.detalle,
                recordarAt: item.recordarAt,
              });
            } else {
              await guardarRecordatorio({
                titulo: item.titulo,
                detalle: item.detalle,
                recordarAt: item.recordarAt,
                chatId,
              });
            }
          } else {
            await guardarEvento({
              titulo: item.titulo,
              detalle: item.detalle,
              categoria: item.categoria,
              fecha: item.fecha,
              hora: item.hora,
            });
          }
        }

        await limpiarAccion(chatId);

        if (tareasCreadas.length === 1 && items.length === 1) {
          await recordarUltimaTarea(chatId, tareasCreadas[0]);
        }

        const creadas = items
          .map((item) => {
            if (item.clase === "recordatorio") {
              return `${item.id ? "✏️" : "⏰"} ${item.titulo} — ${fechaHoraLarga(item.recordarAt)}`;
            }
            if (item.clase === "evento") {
              return `📅 ${item.titulo} — ${fechaLargaDia(item.fecha)}${item.hora ? ` a las ${item.hora}` : ""}`;
            }
            return `✅ ${item.titulo} → ${item.proyectoNombre ?? ETIQUETA_TIPO[item.tipo]}${item.tipo === "programada" && item.fecha ? ` · ${fechaCorta(item.fecha)}` : ""}`;
          })
          .join("\n");

        await enviarMensaje(
          chatId,
          items.length === 1 ? creadas : `Hecho, he creado ${items.length}:\n${creadas}`,
        );
        return Response.json({ ok: true, creada: true });
      }
    }

    if (accion === "recordatorio_cuando") {
      if (respuestaNegativa(texto)) {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Vale, no creo el recordatorio.");
        return Response.json({ ok: true, cancelada: true });
      }

      const original = String(estado?.datos?.texto ?? "").trim();
      const interpretado = await interpretarRecordatorio(
        `${original}\nCuándo: ${texto}`,
      );

      if (!interpretado.recordarAt) {
        await enviarMensaje(
          chatId,
          "No he sabido cuándo. Dime día y hora, por ejemplo «mañana a las 18:00» o «el viernes a las 9:30».",
        );
        return Response.json({ ok: true, pregunta: true });
      }

      await limpiarAccion(chatId);
      await proponerRecordatorio(
        chatId,
        interpretado.titulo,
        interpretado.detalle,
        interpretado.recordarAt,
      );
      return Response.json({ ok: true, pregunta: true, confirmar: true });
    }

    if (accion === "destino_lote") {
      const items = leerItems(estado?.datos ?? {});
      const indices = Array.isArray(estado?.datos?.pendientes)
        ? (estado?.datos?.pendientes as string[])
        : [];

      if (items.length === 0) {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Se me ha perdido la lista. Mándamela otra vez.");
        return Response.json({ ok: true });
      }

      const destino = await interpretarDestino(texto, nombres, items[0].titulo);

      if (destino.accion === "cancelar") {
        await limpiarAccion(chatId);
        await enviarMensaje(chatId, "Vale, no creo nada.");
        return Response.json({ ok: true, cancelada: true });
      }

      const proyecto =
        destino.accion === "proyecto" && destino.proyecto
          ? buscarProyecto(destino.proyecto, listaProyectos)
          : undefined;

      const destinoValido =
        proyecto !== undefined ||
        ["hoy", "manana", "semana"].includes(destino.accion);

      if (!destinoValido) {
        await enviarMensaje(chatId, preguntaDestinoLote(items, nombres));
        return Response.json({ ok: true, pregunta: true });
      }

      const tipo: Tipo = proyecto ? "proyecto" : (destino.accion as Tipo);
      const actualizados = items.map((item, indice) => {
        if (item.clase !== "tarea" || !indices.includes(String(indice))) {
          return item;
        }

        return {
          ...item,
          tipo,
          proyectoId: proyecto?.id ?? null,
          proyectoNombre: proyecto?.nombre ?? null,
        };
      });

      await proponerItems(chatId, actualizados);
      return Response.json({ ok: true, pregunta: true, confirmar: true });
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

      const clasificaciones = await clasificarTareas(texto, nombres);
      await proponerItems(
        chatId,
        clasificaciones.map((clasificacion) => ({
          clase: "tarea" as const,
          titulo: clasificacion.titulo,
          detalle: clasificacion.detalle,
          tipo: "proyecto" as const,
          fecha: null,
          duracion: clasificacion.duracion_estimada_min,
          paralelizable: clasificacion.paralelizable,
          proyectoId: proyecto.id,
          proyectoNombre: proyecto.nombre,
        })),
      );
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

      const clasificaciones = await clasificarTareas(comando.tarea, nombres);
      await proponerItems(
        chatId,
        clasificaciones.map((clasificacion) => ({
          clase: "tarea" as const,
          titulo: clasificacion.titulo,
          detalle: clasificacion.detalle,
          tipo: "proyecto" as const,
          fecha: null,
          duracion: clasificacion.duracion_estimada_min,
          paralelizable: clasificacion.paralelizable,
          proyectoId: proyecto.id,
          proyectoNombre: proyecto.nombre,
        })),
      );
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
          fecha: null,
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
        fecha: null,
        duracion: pendienteDuracion,
        paralelizable: pendienteParalelizable,
        proyectoId: null,
        proyectoNombre: null,
      });
      return Response.json({ ok: true, pregunta: true, confirmar: true });
    }

    // ---------------------------------------------------------------
    // Recordatorio con hora
    // ---------------------------------------------------------------
    const borrador = parsearBorrador(texto);

    if (borrador) {
      await proponerRecordatorio(
        chatId,
        borrador.titulo,
        borrador.titulo,
        borrador.recordarAt,
        "He leído el recordatorio que has pegado.",
      );
      return Response.json({ ok: true, pregunta: true, confirmar: true });
    }

    if (esPeticionRecordatorio(texto)) {
      const interpretado = await interpretarRecordatorio(texto);

      if (!interpretado.recordarAt) {
        await guardarEstado(chatId, {
          accion: "recordatorio_cuando",
          datos: { texto, titulo: interpretado.titulo },
        });
        await enviarMensaje(
          chatId,
          `Vale: «${interpretado.titulo}».\n¿Para qué día y hora? Dímelo así: «mañana a las 18:00» o «el viernes a las 9:30».`,
        );
        return Response.json({ ok: true, pregunta: true });
      }

      await proponerRecordatorio(
        chatId,
        interpretado.titulo,
        interpretado.detalle,
        interpretado.recordarAt,
      );
      return Response.json({ ok: true, pregunta: true, confirmar: true });
    }

    // ---------------------------------------------------------------
    // Evento de calendario: examen, entrega, reunión, cita…
    // ---------------------------------------------------------------
    if (pareceEventoCalendario(texto)) {
      const evento = await interpretarEvento(texto);

      if (!evento.fecha) {
        await guardarEstado(chatId, {
          accion: "evento_cuando",
          datos: { texto },
        });
        await enviarMensaje(
          chatId,
          `Vale: «${evento.titulo}».\n¿Qué día es? Dímelo así: «el 8 de diciembre», «el viernes 20» o «mañana a las 10:00».`,
        );
        return Response.json({ ok: true, pregunta: true });
      }

      await proponerEvento(chatId, {
        titulo: evento.titulo,
        detalle: evento.detalle,
        categoria: evento.categoria,
        fecha: evento.fecha,
        hora: evento.hora,
      });
      return Response.json({ ok: true, pregunta: true, confirmar: true });
    }

    // ---------------------------------------------------------------
    // Nota nueva: una o varias tareas
    // ---------------------------------------------------------------
    const clasificaciones = await clasificarTareas(texto, nombres);

    const sinDestino = clasificaciones
      .map((clasificacion, indice) =>
        !clasificacion.destino_claro && !clasificacion.proyecto_sugerido
          ? indice
          : -1,
      )
      .filter((indice) => indice >= 0);

    const items: ItemPropuesta[] = clasificaciones.map((clasificacion) => {
      // Los proyectos solo se crean si lo pides: aquí solo se busca uno.
      const proyecto = clasificacion.proyecto_sugerido
        ? buscarProyecto(clasificacion.proyecto_sugerido, listaProyectos)
        : undefined;

      return {
        clase: "tarea",
        titulo: clasificacion.titulo,
        detalle: clasificacion.detalle,
        tipo: clasificacion.tipo,
        fecha: clasificacion.fecha,
        duracion: clasificacion.duracion_estimada_min,
        paralelizable: clasificacion.paralelizable,
        proyectoId: proyecto?.id ?? null,
        proyectoNombre: proyecto?.nombre ?? null,
      };
    });

    if (items.length === 1 && sinDestino.length === 1) {
      await guardarPendiente(chatId, clasificaciones[0], texto);
      await enviarMensaje(
        chatId,
        preguntaDestino(clasificaciones[0].titulo, nombres),
      );
      return Response.json({ ok: true, pregunta: true });
    }

    if (sinDestino.length > 0) {
      await guardarEstado(chatId, {
        accion: "destino_lote",
        datos: { items, pendientes: sinDestino.map(String) },
      });
      await enviarMensaje(chatId, preguntaDestinoLote(items, nombres));
      return Response.json({ ok: true, pregunta: true });
    }

    await proponerItems(chatId, items);

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
