import type { Tarea } from "./types";

export const ZONA = "Europe/Madrid";

/** Fecha YYYY-MM-DD en la zona horaria del usuario. */
export function hoyISO(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

/** Fecha YYYY-MM-DD de mañana en la zona del usuario. */
export function mananaISO(fecha: Date = new Date()): string {
  return addDias(hoyISO(fecha), 1);
}

export function addDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "martes, 4 de noviembre" */
export function fechaLarga(fecha: Date = new Date()): string {
  const texto = new Intl.DateTimeFormat("es-ES", {
    timeZone: ZONA,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function saludo(hora: number): string {
  if (hora < 6) return "Buenas noches";
  if (hora < 13) return "Buenos días";
  if (hora < 20) return "Buenas tardes";
  return "Buenas noches";
}

export function horaLocal(fecha: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("es-ES", {
    timeZone: ZONA,
    hour: "numeric",
    hourCycle: "h23",
  }).format(fecha);
  return Number(h);
}

/** ¿La tarea se completó hoy (zona Madrid)? */
export function completadaHoy(tarea: Tarea, hoy: string = hoyISO()): boolean {
  if (tarea.estado !== "hecha" || !tarea.completed_at) return false;
  return hoyISO(new Date(tarea.completed_at)) === hoy;
}

/** Días consecutivos con al menos una tarea completada. */
export function calcRacha(tareas: Tarea[], hoy: string = hoyISO()): number {
  const dias = new Set(
    tareas
      .filter((t) => t.estado === "hecha" && t.completed_at)
      .map((t) => hoyISO(new Date(t.completed_at as string))),
  );

  let cursor = dias.has(hoy) ? hoy : addDias(hoy, -1);
  let racha = 0;
  while (dias.has(cursor)) {
    racha += 1;
    cursor = addDias(cursor, -1);
  }
  return racha;
}
