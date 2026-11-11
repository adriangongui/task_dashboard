export type CategoriaEvento =
  | "examen"
  | "entrega"
  | "reunion"
  | "medico"
  | "cumpleanos"
  | "viaje"
  | "otro";

export interface Evento {
  id: string;
  titulo: string;
  detalle: string;
  categoria: CategoriaEvento;
  fecha: string;
  hora: string | null;
  todo_el_dia: boolean;
  created_at: string;
}

export const CATEGORIAS_EVENTO: Record<
  CategoriaEvento,
  { etiqueta: string; color: string }
> = {
  examen: { etiqueta: "Examen", color: "#D6517D" },
  entrega: { etiqueta: "Entrega", color: "#D97757" },
  reunion: { etiqueta: "Reunión", color: "#5B5DD6" },
  medico: { etiqueta: "Médico", color: "#22A06B" },
  cumpleanos: { etiqueta: "Cumpleaños", color: "#C08A2E" },
  viaje: { etiqueta: "Viaje", color: "#4B93C9" },
  otro: { etiqueta: "Otro", color: "#7A756C" },
};

export const LISTA_CATEGORIAS = Object.keys(
  CATEGORIAS_EVENTO,
) as CategoriaEvento[];

export function esCategoriaEvento(valor: unknown): valor is CategoriaEvento {
  return typeof valor === "string" && valor in CATEGORIAS_EVENTO;
}

/** Deduce la categoría por las palabras del mensaje. */
export function categoriaDeTexto(texto: string): CategoriaEvento | null {
  const t = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\bexamen(?:es)?\b|\bevaluacion\b|\bparcial\b|\brecuperacion\b/.test(t)) {
    return "examen";
  }
  if (/\bentrega(?:s)?\b|\bentregar\b|\btrabajo\s+final\b|\bproyecto\s+final\b|\bdeadline\b/.test(t)) {
    return "entrega";
  }
  if (/\breunion(?:es)?\b|\btutoria\b|\bconferencia\b|\bpresentacion\b|\bclase\b/.test(t)) {
    return "reunion";
  }
  if (/\bmedic[oa]\b|\bdoctor\b|\bdentista\b|\bcita\b|\banalisis\b|\bhospital\b/.test(t)) {
    return "medico";
  }
  if (/\bcumpleanos?\b|\bcumple\b|\baniversario\b/.test(t)) {
    return "cumpleanos";
  }
  if (/\bviaje\b|\bvuelo\b|\btren\b|\bhotel\b|\bvacaciones\b/.test(t)) {
    return "viaje";
  }

  return null;
}

/**
 * ¿El mensaje describe algo que va al calendario (un examen, una entrega,
 * una cita…)? No confunde una tarea normal con un evento.
 */
export function pareceEventoCalendario(texto: string): boolean {
  const t = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (!t) return false;

  const alCalendario =
    /\b(?:calendario|agenda)\b/.test(t) &&
    /\b(?:apunta|anade|agrega|pon|guarda|mete|crea|reserva)\b/.test(t);

  if (alCalendario) return true;

  const sustantivoEvento =
    /\b(?:examen(?:es)?|evaluacion|parcial|recuperacion|entrega(?:s)?|reunion(?:es)?|tutoria|conferencia|presentacion|cumpleanos?|aniversario|boda|viaje|vuelo|hotel|vacaciones|cita\s+medica|medico|dentista|hospital|concierto|partido)\b/.test(
      t,
    );

  if (!sustantivoEvento) return false;

  // «tengo que entregar el proyecto» es una tarea; «la entrega del proyecto
  // es el 8» es un evento del calendario.
  if (
    /\b(?:tengo\s+que|hay\s+que|debo|quiero|necesito)\b/.test(t) &&
    !/\b(?:el|la)\s+(?:examen|entrega|reunion|cita)\b/.test(t)
  ) {
    return false;
  }

  return true;
}
