import { insforgeServer } from "./insforge/server";
import {
  esCategoriaEvento,
  type CategoriaEvento,
  type Evento,
} from "./eventos";

const CAMPOS =
  "id, titulo, detalle, categoria, fecha, hora, todo_el_dia, created_at";

export async function listarEventos(
  desde = "1900-01-01",
  hasta = "2999-12-31",
  categoria?: CategoriaEvento | null,
): Promise<Evento[]> {
  let consulta = insforgeServer()
    .database.from("calendario_eventos")
    .select(CAMPOS)
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (categoria) consulta = consulta.eq("categoria", categoria);

  const { data, error } = await consulta
    .order("fecha", { ascending: true })
    .order("hora", { ascending: true })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as unknown as Evento[];
}

export async function guardarEvento(datos: {
  titulo: string;
  detalle: string;
  categoria: CategoriaEvento;
  fecha: string;
  hora: string | null;
}): Promise<Evento> {
  const { data, error } = await insforgeServer()
    .database.from("calendario_eventos")
    .insert([
      {
        titulo: datos.titulo,
        detalle: datos.detalle,
        categoria: esCategoriaEvento(datos.categoria) ? datos.categoria : "otro",
        fecha: datos.fecha,
        hora: datos.hora,
        todo_el_dia: !datos.hora,
      },
    ])
    .select(CAMPOS);

  if (error) throw error;

  const nuevo = (data as Evento[] | null)?.[0];
  if (!nuevo?.id) throw new Error("No se pudo guardar el evento");
  return nuevo;
}

export async function actualizarEvento(
  id: string,
  cambios: Partial<{
    titulo: string;
    detalle: string;
    categoria: CategoriaEvento;
    fecha: string;
    hora: string | null;
  }>,
): Promise<Evento> {
  const { data, error } = await insforgeServer()
    .database.from("calendario_eventos")
    .update({
      ...cambios,
      ...(cambios.hora !== undefined
        ? { todo_el_dia: cambios.hora === null }
        : {}),
    })
    .eq("id", id)
    .select(CAMPOS);

  if (error) throw error;

  const actualizado = (data as Evento[] | null)?.[0];
  if (!actualizado?.id) throw new Error("No se pudo actualizar el evento");
  return actualizado;
}

export async function borrarEvento(id: string): Promise<void> {
  const { error } = await insforgeServer()
    .database.from("calendario_eventos")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
