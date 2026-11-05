import { interpretarDestinoRapido, normalizarTexto } from "./destino";
import { parsearTiempo } from "./duration";
import { limpiarTitulo } from "./titulo";
import type { Tipo } from "./types";

/**
 * Cambios que el usuario puede pedir sobre una tarea que aún no se ha creado:
 * «sería que la tarea es …», «mejor mañana», «en el proyecto Kerbal».
 */
export interface CambioPropuesta {
  titulo?: string;
  tipo?: Tipo;
  proyectoNombre?: string | null;
  duracion?: number | null;
}

const PREFIJOS: RegExp[] = [
  /^(?:no[,.]?\s*)?(?:ser[ií]a(?:\s+que)?|era|es|mejor|perd[oó]n|quer[ií]a decir|digo|en realidad)\b[\s,:;]*/i,
  /^(?:que\s+)?(?:la\s+)?(?:tarea|t[íi]tulo)\s*(?:es|ser[ií]a|sea|:)\s*/i,
  /^(?:el\s+)?(?:t[íi]tulo|nombre)\s*(?:es|ser[íi]a|:|=)\s*/i,
  /^(?:pon(?:le|la)?|cambia(?:le)?|edita(?:le)?|modifica(?:le)?)\s+(?:el\s+)?(?:t[íi]tulo|texto)\s+(?:a|por|:)?\s*/i,
];

const SOLO_TIEMPO =
  /^(hoy|manana|esta manana|esta tarde|esta noche|semana|esta semana|pasado manana|el lunes|el martes|el miercoles|el jueves|el viernes|el sabado|el domingo)$/;

// «cambia el tiempo a 45 minutos», «ponle una hora», «que dure 90 min».
const CAMBIA_DURACION =
  /(?:cambia(?:le|r)?|pon(?:le|er)?|modifica(?:le|r)?|edita(?:le|r)?|ajusta(?:le|r)?|baja(?:le|r)?|sube(?:le|r)?|actualiza(?:le|r)?|deja(?:le|r)?)\s+(?:(?:la|el)\s+)?(?:duraci[oó]n|tiempo)\b[\s.,:;]*(?:a\s+|en\s+|de\s+)?(.+)$/i;

const DURACION_CON_ETIQUETA =
  /^(?:(?:la|el)\s+)?(?:duraci[oó]n|tiempo)\s*[:\-]?\s*(.+)$/i;

const DURACION_SUELTA =
  /^(?:que\s+dure\s+|a\s+|en\s+|de\s+)?(?:media hora|(?:un\s+)?cuarto de hora|(?:una\s+|la\s+)?hora y (?:media|cuarto)|(?:una\s+|la\s+)?hora|\d{1,3}(?:\s*(?:h|hs|hr|hrs|hora|horas|min|mins|m|minuto|minutos)(?:\s+\d+\s*(?:min|mins|minuto|minutos))?)?)$/i;

const DURACION_CON_PREFIJO =
  /^(?:mejor|ser[ií]a|seria|que\s+sea\s+de|que\s+dure|ponle|d[eé]jala\s+en|dejala\s+en)\s+(.+)$/i;

const SIN_DURACION =
  /(?:quita(?:le|r)?|borra(?:le|r)?|elimina(?:le|r)?|sin)\s+(?:(?:la|el)\s+)?(?:duraci[oó]n|tiempo)\b/i;

function minutosDeTexto(texto: string): number | null {
  const limpio = texto
    .trim()
    .toLowerCase()
    .replace(/^(?:a|en|de|que dure)\s+/, "")
    .replace(/[.!]+$/, "")
    .trim();

  if (/^media hora$/.test(limpio)) return 30;
  if (/^(?:un )?cuarto de hora$/.test(limpio)) return 15;
  if (/^(?:una |la )?hora y media$/.test(limpio)) return 90;
  if (/^(?:una |la )?hora y cuarto$/.test(limpio)) return 75;
  if (/^(?:una |la )?hora$/.test(limpio)) return 60;
  if (/^\d{1,3}$/.test(limpio)) return Number(limpio) || null;

  return parsearTiempo(limpio);
}

/** Minutos pedidos, null si pide quitarla, undefined si no habla de duración. */
function extraerDuracion(texto: string): number | null | undefined {
  const limpio = texto.trim().replace(/\s+/g, " ");

  if (SIN_DURACION.test(limpio)) return null;

  const patrones = [
    CAMBIA_DURACION,
    DURACION_CON_ETIQUETA,
    DURACION_SUELTA,
    DURACION_CON_PREFIJO,
  ];

  for (const patron of patrones) {
    const coincidencia = limpio.match(patron);
    if (!coincidencia) continue;

    const crudo = coincidencia[1] ?? coincidencia[0];
    const minutos = minutosDeTexto(crudo);
    if (minutos) return minutos;
  }

  return undefined;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function extraerTitulo(texto: string): string | null {
  let resto = texto.trim();

  for (let i = 0; i < 4; i += 1) {
    const siguiente = resto
      .replace(PREFIJOS[0], "")
      .replace(PREFIJOS[1], "")
      .replace(PREFIJOS[2], "")
      .replace(PREFIJOS[3], "")
      .trim();
    if (siguiente === resto) break;
    resto = siguiente;
  }

  resto = resto
    .replace(/^["'«“”]+|["'«»“”]+$/g, "")
    .replace(/[.;,]+$/g, "")
    .trim();

  const titulo = limpiarTitulo(resto).slice(0, 120).trim();
  return titulo.length >= 2 ? titulo : null;
}

export function interpretarCorreccion(
  texto: string,
  propuesta: {
    titulo: string;
    tipo: Tipo;
    proyectoNombre: string | null;
    duracion: number | null;
  },
  proyectos: string[],
): CambioPropuesta | null {
  const limpio = texto.trim();
  if (!limpio) return null;

  const cambio: CambioPropuesta = {};

  // «mañana», «esta semana», «en el proyecto Kerbal»: cambia el destino.
  const destino = interpretarDestinoRapido(limpio, proyectos);
  if (destino && destino.accion !== "cancelar" && destino.accion !== "duda") {
    if (destino.accion === "proyecto") {
      if (destino.proyecto) {
        cambio.tipo = "proyecto";
        cambio.proyectoNombre = destino.proyecto;
      }
    } else {
      cambio.tipo = destino.accion;
      cambio.proyectoNombre = null;
    }
  }

  // «cambia la duración a 45 minutos», «media hora», «sin duración».
  const duracion = extraerDuracion(limpio);
  if (duracion !== undefined) cambio.duracion = duracion;

  // El título solo se toca si el mensaje lo pide de forma explícita o si no
  // habla ni de destino ni de duración. Con destino o duración, el texto
  // completo nunca se convierte en título.
  const prefijoTitulo = [PREFIJOS[1], PREFIJOS[2], PREFIJOS[3]].some((prefijo) =>
    prefijo.test(limpio),
  );

  const extraido =
    prefijoTitulo || (!destino && duracion === undefined)
      ? extraerTitulo(limpio)
      : null;

  if (extraido) {
    const normalizado = normalizarTexto(extraido);
    const esSoloTiempo = SOLO_TIEMPO.test(normalizado);

    if (
      !esSoloTiempo &&
      normalizado !== normalizarTexto(propuesta.titulo)
    ) {
      cambio.titulo = capitalizar(extraido);
    }
  }

  if (cambio.titulo === undefined) {
    const mismoTipo = cambio.tipo === undefined || cambio.tipo === propuesta.tipo;
    const mismoProyecto =
      cambio.proyectoNombre === undefined ||
      (cambio.proyectoNombre ?? null) === (propuesta.proyectoNombre ?? null);
    const mismaDuracion =
      cambio.duracion === undefined || cambio.duracion === propuesta.duracion;

    if (mismoTipo && mismoProyecto && mismaDuracion) return null;
  }

  return cambio;
}
