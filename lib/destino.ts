import type { DestinoResuelto } from "./types";

/**
 * Normaliza para comparar: sin acentos, minúsculas y sin puntuación.
 * "Mañana" y "manana" tienen que valer igual.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,;:!¡?¿"'«»()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Respuestas cortas y claras a "¿dónde la pongo?". Se resuelven con reglas
 * para que "en mañana" vaya a Mañana y no dependa de lo que opine el modelo.
 * Devuelve null si la frase necesita que la interprete la IA.
 */
export function interpretarDestinoRapido(
  texto: string,
  proyectos: string[],
): DestinoResuelto | null {
  const limpio = normalizarTexto(texto);
  if (!limpio) return null;

  if (
    /\b(cancel\w*|olvid\w*|borr\w*|descart\w*|no era eso)\b/.test(limpio) ||
    /^(nada|paso|dejalo|paso de|nada de)$/.test(limpio)
  ) {
    return { accion: "cancelar", proyecto: null };
  }

  // Frases largas: mejor que las lea el modelo, aquí daríamos falsos positivos.
  const palabras = limpio.split(" ").filter(Boolean);
  if (palabras.length > 7) return null;

  // "esta mañana" es hoy por la mañana, no el día siguiente.
  if (/\besta manana\b/.test(limpio)) return { accion: "hoy", proyecto: null };
  if (/\b(manana|amanana|dia siguiente)\b/.test(limpio)) {
    return { accion: "manana", proyecto: null };
  }
  if (/\b(hoy|ahora|esta tarde|esta noche)\b/.test(limpio)) {
    return { accion: "hoy", proyecto: null };
  }
  if (
    /\b(semana|proximos dias|estos dias|luego|el lunes|el martes|el miercoles|el jueves|el viernes|el sabado|el domingo)\b/.test(
      limpio,
    )
  ) {
    return { accion: "semana", proyecto: null };
  }

  for (const proyecto of proyectos) {
    const nombre = normalizarTexto(proyecto);
    if (!nombre) continue;
    const patron = new RegExp(`\\b${escaparRegex(nombre)}\\b`);
    if (patron.test(limpio)) {
      return { accion: "proyecto", proyecto };
    }
  }

  return null;
}
