import { interpretarDestinoRapido, normalizarTexto } from "./destino";
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
}

const PREFIJOS: RegExp[] = [
  /^(?:no[,.]?\s*)?(?:ser[ií]a(?:\s+que)?|era|es|mejor|perd[oó]n|quer[ií]a decir|digo|en realidad)\b[\s,:;]*/i,
  /^(?:que\s+)?(?:la\s+)?(?:tarea|t[íi]tulo)\s*(?:es|ser[ií]a|sea|:)\s*/i,
  /^(?:el\s+)?(?:t[íi]tulo|nombre)\s*(?:es|ser[íi]a|:|=)\s*/i,
  /^(?:pon(?:le|la)?|cambia(?:le)?|edita(?:le)?|modifica(?:le)?)\s+(?:el\s+)?(?:t[íi]tulo|texto)\s+(?:a|por|:)?\s*/i,
];

const SOLO_TIEMPO =
  /^(hoy|manana|esta manana|esta tarde|esta noche|semana|esta semana|pasado manana|el lunes|el martes|el miercoles|el jueves|el viernes|el sabado|el domingo)$/;

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
  propuesta: { titulo: string; tipo: Tipo; proyectoNombre: string | null },
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

  // Sin destino reconocible, el mensaje entero es el título nuevo. Con
  // destino, solo lo tomamos como título si trae un prefijo claro («la tarea
  // es …»), para no convertir «mañana» en un título.
  const conPrefijo = PREFIJOS.some((prefijo) => prefijo.test(limpio));
  const extraido = conPrefijo || !destino ? extraerTitulo(limpio) : null;

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

    if (mismoTipo && mismoProyecto) return null;
  }

  return cambio;
}
