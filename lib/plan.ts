import { DURACION_POR_DEFECTO } from "./duration";
import type { Tarea } from "./types";

export interface PlanDia {
  sugeridas: string[];
  minutos_ocupados: number;
  minutos_paralelos: number;
  disponibles: number;
}

/**
 * Plan sencillo, sin IA:
 *  - Primero llena el tiempo disponible con tareas secuenciales (las más
 *    cortas primero, para que quepan más).
 *  - Después añade las paralelizables aunque sumen de más, porque se hacen
 *    a la vez que otra tarea; solo descarta las que no caben ni en paralelo.
 */
export function calcularPlan(
  tareas: Tarea[],
  minutosDisponibles: number,
): PlanDia {
  const pendientes = tareas
    .filter((t) => t.tipo === "hoy" && t.estado === "pendiente")
    .map((t) => ({
      tarea: t,
      minutos: t.duracion_estimada_min ?? DURACION_POR_DEFECTO,
    }));

  const secuenciales = pendientes
    .filter((x) => !x.tarea.paralelizable)
    .sort((a, b) => a.minutos - b.minutos);

  const paralelas = pendientes
    .filter((x) => x.tarea.paralelizable)
    .sort((a, b) => a.minutos - b.minutos);

  const sugeridas: string[] = [];
  let ocupados = 0;

  for (const item of secuenciales) {
    if (ocupados + item.minutos <= minutosDisponibles) {
      sugeridas.push(item.tarea.id);
      ocupados += item.minutos;
    }
  }

  let paralelos = 0;
  for (const item of paralelas) {
    // Puede solaparse con una tarea principal, pero debe caber ella misma
    // dentro del tiempo disponible.
    if (item.minutos <= minutosDisponibles) {
      sugeridas.push(item.tarea.id);
      paralelos += item.minutos;
    }
  }

  return {
    sugeridas,
    minutos_ocupados: ocupados,
    minutos_paralelos: paralelos,
    disponibles: minutosDisponibles,
  };
}
