/**
 * El título de una tarea es la acción; «hoy», «mañana» o «esta semana» eligen
 * columna, no forman parte del título. Esto lo garantiza aunque el modelo se
 * despiste: «Jugar al Roblox para esta semana» → «Jugar al Roblox».
 */

const EXPRESIONES = [
  "pasado mañana",
  "la semana que viene",
  "la próxima semana",
  "esta semana",
  "los próximos días",
  "estos días",
  "el fin de semana",
  "esta mañana",
  "esta tarde",
  "esta noche",
  "el lunes",
  "el martes",
  "el miércoles",
  "el jueves",
  "el viernes",
  "el sábado",
  "el domingo",
  "hoy",
  "mañana",
];

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// De la más larga a la más corta para que «esta semana» gane a «semana».
const ALTERNATIVAS = EXPRESIONES.sort((a, b) => b.length - a.length)
  .map(escapar)
  .join("|");

const PREFIJO = new RegExp(
  `^(?:(?:para|de|en|durante)\\s+)?(?:${ALTERNATIVAS})\\b[\\s,;:.\\-–—]*`,
  "iu",
);

// «por la mañana» o «esta mañana» son parte del momento del día, no un destino.
const SUFIJO = new RegExp(
  `(?<!por la)(?<!por el)(?<!de la)[\\s,;:.\\-–—]+(?:(?:para|de|en)\\s+)?(?:${ALTERNATIVAS})$`,
  "iu",
);

export function limpiarTitulo(titulo: string): string {
  const original = titulo.trim();
  let limpio = original;

  for (let i = 0; i < 3; i += 1) {
    const antes = limpio;
    limpio = limpio
      .replace(PREFIJO, "")
      .replace(SUFIJO, "")
      .replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, "")
      .trim();
    if (limpio === antes) break;
  }

  return limpio.length > 0 ? limpio : original;
}
