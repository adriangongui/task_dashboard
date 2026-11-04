import { insforgeServer } from "./insforge/server";

/** Conversación abierta con el bot y memoria de la última tarea creada. */
export interface EstadoChat {
  chat_id: string;
  accion: string | null;
  datos: Record<string, unknown>;
  ultima_tarea_id: string | null;
}

export async function obtenerEstado(
  chatId: number | string,
): Promise<EstadoChat | null> {
  const { data, error } = await insforgeServer()
    .database.from("estados_chat")
    .select("*")
    .eq("chat_id", String(chatId))
    .limit(1);

  if (error) throw error;

  return (data as EstadoChat[] | null)?.[0] ?? null;
}

export async function guardarEstado(
  chatId: number | string,
  cambios: {
    accion?: string | null;
    datos?: Record<string, unknown>;
    ultima_tarea_id?: string | null;
  },
): Promise<void> {
  const chat = String(chatId);
  const db = insforgeServer().database;
  const estado = await obtenerEstado(chat);

  if (estado) {
    const { error } = await db
      .from("estados_chat")
      .update({ ...cambios, actualizado_at: new Date().toISOString() })
      .eq("chat_id", chat);
    if (error) throw error;
    return;
  }

  const { error } = await db.from("estados_chat").insert([
    {
      chat_id: chat,
      accion: cambios.accion ?? null,
      datos: cambios.datos ?? {},
      ultima_tarea_id: cambios.ultima_tarea_id ?? null,
    },
  ]);
  if (error) throw error;
}

/** Cierra la conversación abierta sin tocar la memoria de la última tarea. */
export async function limpiarAccion(chatId: number | string): Promise<void> {
  await guardarEstado(chatId, { accion: null, datos: {} });
}

export async function recordarUltimaTarea(
  chatId: number | string,
  tareaId: string,
): Promise<void> {
  await guardarEstado(chatId, { ultima_tarea_id: tareaId });
}
