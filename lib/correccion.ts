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
  if (/^(?:una |la )?horas? y media$/.test(limpio)) return 90;
  if (/^(?:una |la )?horas? y cuarto$/.test(limpio)) return 75;
  if (/^(?:una |la )?horas?$/.test(limpio)) return 60;
  if (/^\d{1,3}$/.test(limpio)) return Number(limpio) || null;

  // «hora y 20», «1h 20», «1 h 20», «1h20».
  const horaYNumero = limpio.match(
    /^(?:una\s+|la\s+)?horas?(?:\s+y\s*|\s+)(\d{1,2})$/, 
  );
  if (horaYNumero) return 60 + Number(horaYNumero[1]);

  const horasConMinutos = limpio.match(
    /^(\d{1,2})\s*h(?:oras?)?\s*(?:y\s*)?(\d{1,2})$/, 
  );
  if (horasConMinutos) {
    return Number(horasConMinutos[1]) * 60 + Number(horasConMinutos[2]);
  }

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

const PALABRAS_VACIAS = new Set([
  "hacer",
  "haz",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "para",
  "en",
  "que",
  "son",
  "es",
  "sea",
  "sean",
  "con",
  "por",
  "al",
  "min",
  "mins",
  "minuto",
  "minutos",
  "hora",
  "horas",
  "duracion",
  "tiempo",
  "tarea",
  "tareas",
  "primera",
  "primero",
  "segunda",
  "segundo",
  "tercera",
  "tercero",
  "todas",
  "todos",
  "ambas",
]);

function palabrasClave(texto: string): string[] {
  return normalizarTexto(texto)
    .split(/[^a-z0-9]+/)
    .filter(
      (palabra) => palabra.length >= 3 && !PALABRAS_VACIAS.has(palabra),
    );
}

/** Trocea el mensaje por comas, puntos, saltos y «y», sin romper «hora y 20». */
function trocear(texto: string): string[] {
  const partes = texto
    .split(/\n|;|,|\.|\by\b/i)
    .map((parte) => parte.trim())
    .filter(Boolean);

  const trozos: string[] = [];

  for (const parte of partes) {
    const anterior = trozos[trozos.length - 1];
    const esFragmento =
      /^(?:\d{1,3}\s*(?:min|mins|minutos?|m)?|media|cuarto(?:\s+de\s+hora)?|\d{1,3})$/.test(
        parte,
      );
    const trasHora =
      anterior !== undefined && /\b(?:h|hs|hr|hrs|hora|horas)$/i.test(anterior);

    if (anterior !== undefined && (esFragmento || trasHora)) {
      trozos[trozos.length - 1] = `${anterior} y ${parte}`;
    } else {
      trozos.push(parte);
    }
  }

  return trozos;
}

function indicePorOrdinal(trozo: string): number {
  const limpio = normalizarTexto(trozo);

  if (/\b(?:todas|todos|ambas|las dos|las 2)\b/.test(limpio)) return -1;
  if (/\b(?:primera|primero|1a|1ª)\b/.test(limpio)) return 0;
  if (/\b(?:segunda|segundo|2a|2ª)\b/.test(limpio)) return 1;
  if (/\b(?:tercera|tercero|3a|3ª)\b/.test(limpio)) return 2;

  return -2;
}

function indicePorTitulo(
  trozo: string,
  items: Array<{ titulo: string }>,
): number {
  const buscadas = palabrasClave(trozo);
  let mejor = -2;
  let puntuacion = 0;

  items.forEach((item, indice) => {
    const propias = palabrasClave(item.titulo);
    const coincidencias = propias.filter((palabra) =>
      buscadas.includes(palabra),
    ).length;

    if (coincidencias > puntuacion) {
      puntuacion = coincidencias;
      mejor = indice;
    }
  });

  return mejor;
}

/** Minutos que pide un trozo, quitando la referencia a la tarea. */
function minutosDeTrozo(
  trozo: string,
  titulo?: string,
): number | null | undefined {
  let resto = normalizarTexto(trozo);

  if (titulo) {
    for (const palabra of palabrasClave(titulo)) {
      resto = resto.replace(new RegExp(`\\b${palabra}\\b`, "g"), " ");
    }
  }

  resto = resto
    .replace(/\b(?:la|el)\s+(?:duracion|tiempo)\b/g, " ")
    .replace(/\b(?:la|el)\s+de\b/g, " ")
    .replace(/\b(?:la|el)\s+(?:primera|primero|segunda|segundo|tercera|tercero)\b/g, " ")
    .replace(/\b(?:todas|todos|ambas|las dos)\b/g, " ")
    .replace(/\b(?:tarea|tareas)\b/g, " ")
    .replace(/\b(?:son|sea|sean|que|dure|dura|ponle|pon|deja|dejala)\b/g, " ")
    .replace(/^\s*(?:a|en|de|es)\s+/g, " ")
    .replace(/^\s*(?:es|a|en|de)\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!resto) return undefined;

  const minutos = minutosDeTexto(resto);
  return minutos ?? undefined;
}

export interface BorradorTarea {
  titulo?: string;
  tipo?: Tipo;
  duracion?: number | null;
  proyectoNombre?: string | null;
}

/** Reconoce la plantilla que copia el botón «Editar» y sus retoques. */
export function parsearBorradorTareas(texto: string): BorradorTarea[] | null {
  const lineas = texto
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean);

  if (lineas.length === 0) return null;

  const items: BorradorTarea[] = [];

  for (const linea of lineas) {
    if (!linea.includes("|")) return null;

    const campos = linea.split("|").map((campo) => campo.trim());
    const item: BorradorTarea = {};
    let tieneTitulo = false;

    for (const campo of campos) {
      const corte = campo.indexOf(":");
      if (corte < 0) continue;

      const clave = normalizarTexto(campo.slice(0, corte));
      const valor = campo.slice(corte + 1).trim();
      if (!valor) continue;

      if (clave.startsWith("titulo")) {
        item.titulo = limpiarTitulo(valor);
        tieneTitulo = true;
      } else if (
        clave.startsWith("cuando") ||
        clave.startsWith("columna") ||
        clave.startsWith("destino")
      ) {
        const destino = interpretarDestinoRapido(valor, []);

        if (destino && ["hoy", "manana", "semana"].includes(destino.accion)) {
          item.tipo = destino.accion as Tipo;
        } else if (destino?.accion === "proyecto") {
          item.tipo = "proyecto";
        }
      } else if (
        clave.startsWith("duracion") ||
        clave.startsWith("tiempo")
      ) {
        const limpio = normalizarTexto(valor);

        if (/^(?:sin|ninguna|ninguno|nada|-|—|0)$/.test(limpio)) {
          item.duracion = null;
        } else {
          const minutos = minutosDeTexto(limpio);
          if (minutos) item.duracion = minutos;
        }
      } else if (clave.startsWith("proyecto")) {
        const limpio = normalizarTexto(valor);
        item.proyectoNombre = /^(?:sin(?:\s+proyecto)?|ninguno?|ninguna|-|—|0)$/.test(
          limpio,
        )
          ? null
          : valor;
      }
    }

    if (!tieneTitulo) return null;
    items.push(item);
  }

  return items;
}

export interface CambioEnLote {
  /** Índice de la tarea, o -1 para todas. */
  indice: number;
  cambio: CambioPropuesta;
}

/**
 * Cambios sobre una propuesta con varias tareas: «mates 30 minutos y dibujo
 * 1h 20», «la primera 20 y la segunda 40», «todas 30».
 */
export function interpretarCorrecciones(
  texto: string,
  items: Array<{
    titulo: string;
    tipo: Tipo;
    proyectoNombre: string | null;
    duracion: number | null;
  }>,
  proyectos: string[],
): CambioEnLote[] {
  if (items.length === 0) return [];

  if (items.length === 1) {
    const cambio = interpretarCorreccion(texto, items[0], proyectos);
    return cambio ? [{ indice: 0, cambio }] : [];
  }

  const cambios: CambioEnLote[] = [];

  // Destino común: «todo para mañana», «en el proyecto Kerbal».
  const destino = interpretarDestinoRapido(texto, proyectos);
  if (destino && destino.accion !== "cancelar" && destino.accion !== "duda") {
    cambios.push({
      indice: -1,
      cambio:
        destino.accion === "proyecto"
          ? { tipo: "proyecto", proyectoNombre: destino.proyecto }
          : { tipo: destino.accion, proyectoNombre: null },
    });
  }

  const asignadas = new Set<number>();

  for (const trozo of trocear(texto)) {
    let indice = indicePorOrdinal(trozo);
    if (indice === -2) indice = indicePorTitulo(trozo, items);

    const titulo = indice >= 0 ? items[indice]?.titulo : undefined;
    const minutos = minutosDeTrozo(trozo, titulo);

    if (minutos === undefined) continue;

    if (indice === -2) {
      const libres = items
        .map((_, posicion) => posicion)
        .filter((posicion) => !asignadas.has(posicion));

      if (libres.length !== 1) continue;
      indice = libres[0];
    }

    if (indice === -1) {
      items.forEach((_, posicion) => {
        cambios.push({ indice: posicion, cambio: { duracion: minutos } });
        asignadas.add(posicion);
      });
    } else {
      cambios.push({ indice, cambio: { duracion: minutos } });
      asignadas.add(indice);
    }
  }

  return cambios;
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
