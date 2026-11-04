/** Convierte "2h 30min", "90", "1,5h" o "1:30" a minutos. */
export function parsearTiempo(input: string): number | null {
  const s = input.trim().toLowerCase().replace(",", ".");
  if (!s) return null;

  const reloj = s.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
  if (reloj) {
    const total = Number(reloj[1]) * 60 + Number(reloj[2]);
    return total > 0 ? total : null;
  }

  let total = 0;
  let encontrado = false;

  const horas = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hs|hr|hrs|hora|horas)\b/);
  if (horas) {
    total += Number(horas[1]) * 60;
    encontrado = true;
  }

  const minutos = s.match(/(\d+)\s*(?:m|min|mins|minuto|minutos)\b/);
  if (minutos) {
    total += Number(minutos[1]);
    encontrado = true;
  }

  if (!encontrado && /^\d+$/.test(s)) {
    total = Number(s);
    encontrado = true;
  }

  return encontrado && total > 0 ? Math.round(total) : null;
}

export function formatMin(min: number | null | undefined): string {
  if (min === null || min === undefined) return "sin estimar";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export const DURACION_POR_DEFECTO = 30;
