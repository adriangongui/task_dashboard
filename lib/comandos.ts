export type Comando =
  | { tipo: "crear_proyecto"; nombre: string }
  | { tipo: "anadir_a_proyecto"; proyecto: string; tarea: string | null }
  | { tipo: "borrar_ultima" }
  | { tipo: "borrar_tarea"; texto: string }
  | { tipo: "borrar_generico" }
  | { tipo: "listar_recordatorios" };

/**
 * Reconoce órdenes explícitas en el mensaje. Devuelve null cuando el texto es
 * una tarea normal y debe pasar por el clasificador.
 */
export function parsearComando(texto: string): Comando | null {
  const limpio = texto
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[.!¿?¡]+|[.!¿?¡]+$/g, "")
    .trim();

  if (!limpio) return null;

  if (
    /^(?:(?:mis|los|ver)\s+)?recordatorios(?:\s+(?:pendientes|pr[oó]ximos|siguientes))?$/i.test(
      limpio,
    ) ||
    /^(?:qu[eé]|que)\s+recordatorios\s+(?:tengo|hay)(?:\s+pendientes)?$/i.test(
      limpio,
    ) ||
    /^(?:lista|listar|muestra|mu[eé]strame|ens[eé][nñ]ame)\s+(?:mis\s+|los\s+)?recordatorios$/i.test(
      limpio,
    )
  ) {
    return { tipo: "listar_recordatorios" };
  }

  const crear = limpio.match(
    /^(?:crea|crear|a[nñ]ade|agrega)\s+(?:un\s+|una\s+|el\s+)?(?:nuevo\s+|nueva\s+)?proyecto(?:\s+(?:nuevo|nueva))?(?:\s+(?:llamado|llamada|que\s+se\s+llame|de\s+nombre|con\s+nombre|titulado|titulada))?\s*:?\s*(.+)$/i,
  );
  if (crear) {
    const nombre = crear[1]
      .replace(/^["'«“”]+|["'«»“”]+$/g, "")
      .trim();
    if (nombre) return { tipo: "crear_proyecto", nombre };
  }

  const anadirTareaPrimero = limpio.match(
    /^(?:mete|a[nñ]ade|agrega|pon|guarda)\s+(?:(?:la|las|estas|esas)\s+)?tareas?\s*:?\s+(.+?)\s+(?:en|al|dentro\s+del)\s+(?:el\s+)?proyecto\s+(.+)$/i,
  );
  if (anadirTareaPrimero) {
    return {
      tipo: "anadir_a_proyecto",
      tarea: anadirTareaPrimero[1].trim(),
      proyecto: anadirTareaPrimero[2].trim(),
    };
  }

  const anadirProyectoPrimero = limpio.match(
    /^(?:mete|a[nñ]ade|agrega|pon|guarda)\s+(?:en|al|dentro\s+del)\s+(?:el\s+)?proyecto\s+(.+?)\s+(?:(?:la|las|estas|esas|una|un)\s+)?tareas?\s*:?\s+(.+)$/i,
  );
  if (anadirProyectoPrimero) {
    return {
      tipo: "anadir_a_proyecto",
      proyecto: anadirProyectoPrimero[1].trim(),
      tarea: anadirProyectoPrimero[2].trim(),
    };
  }

  const anadirSinTarea = limpio.match(
    /^(?:mete|a[nñ]ade|agrega|pon|guarda)\s+(?:en|al|dentro\s+del)\s+(?:el\s+)?proyecto\s+(.+?)(?:\s+(?:una|la)\s+tareas?)?$/i,
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
