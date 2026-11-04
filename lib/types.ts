export type Tipo = "hoy" | "manana" | "semana" | "proyecto";

export type Estado = "pendiente" | "hecha" | "sin_terminar";

export interface Proyecto {
  id: string;
  nombre: string;
  color: string;
  created_at: string;
}

export interface NuevaTarea {
  titulo: string;
  detalle: string;
  tipo: Tipo;
  proyecto_id: string | null;
  duracion_estimada_min: number | null;
  paralelizable: boolean;
}

export interface Tarea {
  id: string;
  titulo: string;
  detalle: string;
  tipo: Tipo;
  estado: Estado;
  duracion_estimada_min: number | null;
  paralelizable: boolean;
  proyecto_id: string | null;
  fecha_para: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Lo que devuelve el clasificador de IA. */
export interface Clasificacion {
  titulo: string;
  detalle: string;
  tipo: Tipo;
  duracion_estimada_min: number | null;
  paralelizable: boolean;
  proyecto_sugerido: string | null;
  /** false si la nota no dice cuándo ni dónde va: hay que preguntar. */
  destino_claro: boolean;
}

/** Resultado de interpretar la respuesta a "¿dónde pongo esto?". */
export interface DestinoResuelto {
  accion: "hoy" | "manana" | "semana" | "proyecto" | "cancelar" | "duda";
  proyecto: string | null;
}
