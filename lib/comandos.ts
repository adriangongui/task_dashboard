export type Comando =
  | { tipo: "crear_proyecto"; nombre: string }
  | { tipo: "anadir_a_proyecto"; proyecto: string; tarea: string | null }
  | { tipo: "borrar_ultima" }
  | { tipo: "borrar_tarea"; texto: string }
  | { tipo: "borrar_generico" };

/**
 * Reconoce órdenes explícitas en el mensaje. Devuelve null cuando el texto es
 * una tarea normal y debe pasar por el clasificador.
 */
export function parsearComando(texto: string): Comando | null {
  const limpio = texto
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!¿?¡]+$/g, "")
    .trim();

  if (!limpio) return null;

  const crear = limpio.match(
    /^crea(?:r)?\s+(?:un\s+|el\s+)?proyecto(?:\s+(?:llamado|que se llame|de nombre))?\s+(.+)$/i,
  );
  if (crear) {
    return { tipo: "crear_proyecto", nombre: crear[1].trim() };
  }

  const anadirTareaPrimero = limpio.match(
    /^(?:mete|a[nñ]ade|agrega|pon|guarda)\s+(?:la\s+)?tarea\s+(.+?)\s+(?:en|al|dentro\s+del)\s+(?:el\s+)?proyecto\s+(.+)$/i,
  );
  if (anadirTareaPrimero) {
    return {
      tipo: "anadir_a_proyecto",
      tarea: anadirTareaPrimero[1].trim(),
      proyecto: anadirTareaPrimero[2].trim(),
    };
  }

  const anadirProyectoPrimero = limpio.match(
    /^(?:mete|a[nñ]ade|agrega|pon|guarda)\s+(?:en|al|dentro\s+del)\s+(?:el\s+)?proyecto\s+(.+?)\s+(?:la\s+)?tarea\s+(.+)$/i,
  );
  if (anadirProyectoPrimero) {
    return {
      tipo: "anadir_a_proyecto",
      proyecto: anadirProyectoPrimero[1].trim(),
      tarea: anadirProyectoPrimero[2].trim(),
    };
  }

  const anadirSinTarea = limpio.match(
    /^(?:mete|a[nñ]ade|agrega|pon|guarda)\s+(?:en|al|dentro\s+del)\s+(?:el\s+)?proyecto\s+(.+)$/i,
  );
  if (anadirSinTarea) {
    return {
      tipo: "anadir_a_proyecto",
      proyecto: anadirSinTarea[1].trim(),
      tarea: null,
    };
  }

  if (
    /^(?:elimina|borra|quita)\s+(?:la\s+)?(?:tarea\s+)?(?:anterior|[uú]ltima)$/i.test(
      limpio,
    )
  ) {
    return { tipo: "borrar_ultima" };
  }

  if (
    /^(?:elimina|borra|quita)\s+(?:todas\s+)?(?:las\s+)?tareas$/i.test(limpio)
  ) {
    return { tipo: "borrar_generico" };
  }

  const borrarConcreta = limpio.match(
    /^(?:elimina|borra|quita)\s+(?:la\s+)?tarea\s+(?:de\s+)?(.+)$/i,
  );
  if (borrarConcreta) {
    return { tipo: "borrar_tarea", texto: borrarConcreta[1].trim() };
  }

  return null;
}
