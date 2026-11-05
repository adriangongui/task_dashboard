import { ZONA } from "./dates";
import { insforgeServer } from "./insforge/server";

export interface Recordatorio {
  id: string;
  titulo: string;
  detalle: string;
  recordar_at: string;
  enviado: boolean;
  chat_id: string | null;
  created_at: string;
}

/** ¿El mensaje pide un recordatorio con hora? */
export function esPeticionRecordatorio(texto: string): boolean {
  return /^(?:recu[eé]rdame|recordatorio|av[ií]same|acu[eé]rdate)\b/i.test(
    texto.trim(),
  );
}

/** "2026-11-10" + "18:00" en Madrid → ISO UTC. */
export function madridAISO(fecha: string, hora: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  if (!/^\d{2}:\d{2}$/.test(hora)) return null;

  const comoUTC = new Date(`${fecha}T${hora}:00Z`);
  if (Number.isNaN(comoUTC.getTime())) return null;

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(comoUTC);

  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  const mostrado = new Date(
    `${valor("year")}-${valor("month")}-${valor("day")}T${valor("hour")}:${valor("minute")}:00Z`,
  );

  const desfase = comoUTC.getTime() - mostrado.getTime();
  return new Date(comoUTC.getTime() + desfase).toISOString();
}

/** Fecha (YYYY-MM-DD) y hora (HH:mm) de un instante, en Madrid. */
export function partesMadrid(iso: string): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));

  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return {
    fecha: `${valor("year")}-${valor("month")}-${valor("day")}`,
    hora: `${valor("hour")}:${valor("minute")}`,
  };
}

/** "Martes, 10 de noviembre de 2026 a las 18:00" */
export function fechaHoraLarga(iso: string): string {
  const texto = new Intl.DateTimeFormat("es-ES", {
    timeZone: ZONA,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Texto que se copia con el botón «Editar». */
export function borradorRecordatorio(titulo: string, recordarAt: string): string {
  const { fecha, hora } = partesMadrid(recordarAt);
  const [anio, mes, dia] = fecha.split("-");
  return `recuérdame el ${dia}/${mes}/${anio} a las ${hora}: ${titulo}`;
}

/** Reconoce el borrador copiado y editado a mano. */
export function parsearBorrador(
  texto: string,
): { titulo: string; recordarAt: string } | null {
  const coincidencia = texto
    .trim()
    .match(
      /^recu[eé]rdame(?:\s+el)?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+a\s+las\s+(\d{1,2}):(\d{2})\s*:?\s*(.+)$/i,
    );

  if (!coincidencia) return null;

  const [, dia, mes, anio, hh, mm, titulo] = coincidencia;
  const fecha = `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  const hora = `${hh.padStart(2, "0")}:${mm}`;
  const recordarAt = madridAISO(fecha, hora);
  const limpio = titulo.trim();

  if (!recordarAt || !limpio) return null;
  return { titulo: limpio, recordarAt };
}

export async function guardarRecordatorio(datos: {
  titulo: string;
  detalle: string;
  recordarAt: string;
  chatId: string | number;
}): Promise<string> {
  const { data, error } = await insforgeServer()
    .database.from("recordatorios")
    .insert([
      {
        titulo: datos.titulo,
        detalle: datos.detalle,
        recordar_at: datos.recordarAt,
        chat_id: String(datos.chatId),
      },
    ])
    .select("id");

  if (error) throw error;

  const id = (data as Array<{ id?: string }> | null)?.[0]?.id;
  if (!id) throw new Error("No se pudo guardar el recordatorio");

  return id;
}

export async function listarRecordatoriosPendientes(
  limite = 20,
): Promise<Recordatorio[]> {
  const { data, error } = await insforgeServer()
    .database.from("recordatorios")
    .select("*")
    .eq("enviado", false)
    .order("recordar_at", { ascending: true })
    .limit(limite);

  if (error) throw error;

  return (data ?? []) as unknown as Recordatorio[];
}

export async function pendientesDeEnviar(): Promise<Recordatorio[]> {
  const { data, error } = await insforgeServer()
    .database.from("recordatorios")
    .select("*")
    .eq("enviado", false)
    .lte("recordar_at", new Date().toISOString())
    .order("recordar_at", { ascending: true })
    .limit(20);

  if (error) throw error;

  return (data ?? []) as unknown as Recordatorio[];
}

export async function marcarEnviado(id: string): Promise<void> {
  const { error } = await insforgeServer()
    .database.from("recordatorios")
    .update({ enviado: true })
    .eq("id", id);

  if (error) throw error;
}

export async function tokenRecordatorios(): Promise<string | null> {
  const { data, error } = await insforgeServer()
    .database.from("ajustes")
    .select("valor")
    .eq("clave", "recordatorios_token")
    .limit(1);

  if (error) throw error;

  return (data as Array<{ valor?: string }> | null)?.[0]?.valor ?? null;
}
