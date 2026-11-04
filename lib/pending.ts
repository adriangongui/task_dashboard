import type { Clasificacion } from "./types";
import { insforgeServer } from "./insforge/server";

/** Una nota que espera saber a qué columna va. */
export interface TareaPendiente {
  id: string;
  chat_id: string;
  texto: string;
  titulo: string;
  detalle: string;
  duracion_estimada_min: number | null;
  paralelizable: boolean;
  created_at: string;
}

/** Pasado este tiempo damos la pregunta por abandonada. */
const HORAS_VALIDA = 24;

export async function obtenerPendiente(
  chatId: number | string,
): Promise<TareaPendiente | null> {
  const insforge = insforgeServer();

  const { data, error } = await insforge.database
    .from("tareas_pendientes")
    .select("*")
    .eq("chat_id", String(chatId))
    .limit(1);

  if (error) throw error;

  const fila = (data as TareaPendiente[] | null)?.[0];
  if (!fila) return null;

  const edadHoras = (Date.now() - new Date(fila.created_at).getTime()) / 36e5;
  if (!Number.isFinite(edadHoras) || edadHoras > HORAS_VALIDA) {
    await borrarPendiente(fila.id);
    return null;
  }

  return fila;
}

export async function guardarPendiente(
  chatId: number | string,
  clasificacion: Clasificacion,
  texto: string,
): Promise<void> {
  const insforge = insforgeServer();
  const chat = String(chatId);

  // Un solo pendiente por chat: reemplaza el anterior si lo hubiera.
  const { error: errorBorrar } = await insforge.database
    .from("tareas_pendientes")
    .delete()
    .eq("chat_id", chat);

  if (errorBorrar) throw errorBorrar;

  const { error } = await insforge.database.from("tareas_pendientes").insert([
    {
      chat_id: chat,
      texto,
      titulo: clasificacion.titulo,
      detalle: clasificacion.detalle,
      duracion_estimada_min: clasificacion.duracion_estimada_min,
      paralelizable: clasificacion.paralelizable,
    },
  ]);

  if (error) throw error;
}

export async function borrarPendiente(id: string): Promise<void> {
  const insforge = insforgeServer();

  const { error } = await insforge.database
    .from("tareas_pendientes")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
