import { categoriaDeTexto, type CategoriaEvento } from "./eventos";
import { rangoDeTexto, type RangoFechas } from "./fechas";

export type Comando =
  | { tipo: "crear_proyecto"; nombre: string }
  | { tipo: "anadir_a_proyecto"; proyecto: string; tarea: string | null }
  | { tipo: "borrar_ultima" }
  | { tipo: "borrar_tarea"; texto: string }
  | { tipo: "borrar_generico" }
  | { tipo: "listar_recordatorios"; rango: RangoFechas }
  | {
      tipo: "cancelar_recordatorio";
      rango: RangoFechas;
      texto: string | null;
    }
  | {
      tipo: "editar_recordatorio";
      rango: RangoFechas;
      texto: string | null;
    }
  | {
      tipo: "consultar_calendario";
      rango: RangoFechas;
      categoria: CategoriaEvento | null;
      texto: string;
    };

const PALABRAS_RANGO =
  /\b(?:de|del|para|el|la|los|las|dia|hoy|manana|esta|este|semana|mes|que|viene|proximo|siguiente|actual|mis|todos|todas)\b/gi;

function limpiar(texto: string): string {
  return texto
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[.!¿?¡]+|[.!¿?¡]+$/g, "")
    .trim();
}

function separarRango(resto: string | undefined): {
  rango: RangoFechas;
  texto: string | null;
} {
  if (!resto) return { rango: "todo", texto: null };

  const rango = rangoDeTexto(resto);
  const sinRango = resto
    .replace(PALABRAS_RANGO, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
    .trim();

  return {
    rango,
    texto: sinRango.length >= 2 ? resto.trim() : null,
  };
}

/**
 * Reconoce órdenes explícitas en el mensaje. Devuelve null cuando el texto es
 * una tarea normal y debe pasar por el clasificador.
 */
export function parsearComando(texto: string): Comando | null {
  const limpio = limpiar(texto);
  if (!limpio) return null;

  // Para reconocer «exámenes», «reunión» o «médico» sin depender de las tildes.
  const plano = limpio
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // ------------------------------------------------------------
  // Calendario: «dime los exámenes de la semana que viene»
  // ------------------------------------------------------------
  const consultaCalendario =
    /^(?:dime|que|cuales|lista|listar|muestra|muestrame|ensename|hay|ver)\b/i.test(
      plano,
    ) &&
    /\b(?:calendario|agenda|examen(?:es)?|evaluacion|parcial|entrega(?:s)?|evento(?:s)?|reunion(?:es)?|cita|medico|dentista|cumpleanos?|viaje|concierto)\b/i.test(
      plano,
    );

  if (consultaCalendario) {
    return {
      tipo: "consultar_calendario",
      rango: rangoDeTexto(limpio),
      categoria: categoriaDeTexto(limpio),
      texto: limpio,
    };
  }

  if (/^(?:el\s+)?calendario(?:\s+de\s+(?:este|el)\s+mes)?$/i.test(plano)) {
    return {
      tipo: "consultar_calendario",
      rango: "mes",
      categoria: null,
      texto: limpio,
    };
  }

  // ------------------------------------------------------------
  // Recordatorios: listar, cancelar y editar
  // ------------------------------------------------------------
  const cancelar = limpio.match(
    /^(?:cancela|cancelar|borra|borrar|elimina|eliminar|quita|quitar)\s+(?:el\s+|la\s+|los\s+|las\s+)?recordatorio(?:s)?(?:\s+(?:del|de|para)\s+(.+))?$/i,
  );
  if (cancelar) {
    const { rango, texto: resto } = separarRango(cancelar[1]);
    return { tipo: "cancelar_recordatorio", rango, texto: resto };
  }

  const editar = limpio.match(
    /^(?:edita|editar|cambia|cambiar|modifica|modificar|actualiza|actualizar|mueve|mover)\s+(?:el\s+|la\s+|los\s+|las\s+)?recordatorio(?:s)?(?:\s+(?:del|de|para)\s+(.+))?$/i,
  );
  if (editar) {
    const { rango, texto: resto } = separarRango(editar[1]);
    return { tipo: "editar_recordatorio", rango, texto: resto };
  }

  const listar = limpio.match(
    /^(?:(?:dime|ver|lista|listar|muestra|mu[eé]strame|ens[eé][nñ]ame)\s+)?(?:mis\s+|los\s+|las\s+)?recordatorios(?:\s+(?:del|de|para)\s+(.+))?$/i,
  );
  if (listar) {
    return {
      tipo: "listar_recordatorios",
      rango: rangoDeTexto(listar[1] ?? ""),
    };
  }

  const listarQueHay = limpio.match(
    /^(?:(?:dime|ver|lista|listar|muestra|mu[eé]strame|ens[eé][nñ]ame)\s+)?(?:todos\s+|todas\s+)?(?:mis\s+|los\s+|las\s+)?recordatorios\s+(?:que\s+hay|hay)(?:\s+(?:para|de|del)\s+(.+))?$/i,
  );
  if (listarQueHay) {
    return {
      tipo: "listar_recordatorios",
      rango: rangoDeTexto(listarQueHay[1] ?? ""),
    };
  }

  if (
    /^(?:qu[eé]|que)\s+recordatorios\s+(?:tengo|hay)(?:\s+pendientes)?(?:\s+(?:para|de)\s+(.+))?$/i.test(
      limpio,
    )
  ) {
    const resto = limpio.match(/(?:para|de)\s+(.+)$/i)?.[1] ?? "";
    return { tipo: "listar_recordatorios", rango: rangoDeTexto(resto) };
  }

  // ------------------------------------------------------------
  // Proyectos y tareas
  // ------------------------------------------------------------
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
