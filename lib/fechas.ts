import { addDias, hoyISO } from "./dates";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

const NUMEROS: Record<string, number> = {
  "un par de": 2,
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  veinte: 20,
  treinta: 30,
};

export type RangoFechas =
  | "hoy"
  | "manana"
  | "semana"
  | "semana_que_viene"
  | "mes"
  | "mes_que_viene"
  | "todo";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function fechaValida(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return null;
  }

  return fecha.toISOString().slice(0, 10);
}

function ultimoDiaDelMes(anio: number, mes: number): string {
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

function sumarMeses(
  anio: number,
  mes: number,
  delta: number,
): { anio: number; mes: number } {
  const indice = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(indice / 12), mes: (indice % 12) + 1 };
}

function cantidadRelativa(token: string): number | null {
  if (/^\d{1,3}$/.test(token)) return Number(token);
  return NUMEROS[token] ?? null;
}

/** Suma días, semanas, meses o años conservando el día (con ajuste a fin de mes). */
function sumarUnidad(hoy: string, cantidad: number, unidad: string): string {
  const [anio, mes, dia] = hoy.split("-").map(Number);

  if (unidad.startsWith("dia")) return addDias(hoy, cantidad);
  if (unidad.startsWith("semana")) return addDias(hoy, cantidad * 7);

  if (unidad.startsWith("mes")) {
    const { anio: a, mes: m } = sumarMeses(anio, mes, cantidad);
    const ultimo = Number(ultimoDiaDelMes(a, m).slice(8));
    return fechaValida(a, m, Math.min(dia, ultimo)) ?? hoy;
  }

  const a = anio + cantidad;
  const ultimo = Number(ultimoDiaDelMes(a, mes).slice(8));
  return fechaValida(a, mes, Math.min(dia, ultimo)) ?? hoy;
}

/**
 * Deduce una fecha concreta de expresiones como «el día 8 del mes que viene»,
 * «el 8 de diciembre», «8/12», «el lunes», «dentro de 3 semanas» o «el 8».
 * Devuelve YYYY-MM-DD o null si el texto no habla de un día.
 */
export function fechaDeTexto(texto: string, hoy: string = hoyISO()): string | null {
  const t = normalizar(texto);
  if (!t) return null;

  const [anioActual, mesActual, diaActual] = hoy.split("-").map(Number);

  const relativo = t.match(
    /\b(?:dentro de|en)\s+(\d{1,3}|un par de|una|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta)\s*(dias?|semanas?|mes(?:es)?|anos?)\b/,
  );
  if (relativo) {
    const cantidad = cantidadRelativa(relativo[1]);
    if (cantidad !== null) return sumarUnidad(hoy, cantidad, relativo[2]);
  }

  // «el mes que viene» o «el año que viene», sin un día concreto.
  if (
    /\b(?:el\s+)?(?:mes\s+(?:que\s+viene|proximo|siguiente)|proximo\s+mes|siguiente\s+mes)\b/.test(
      t,
    )
  ) {
    return sumarUnidad(hoy, 1, "mes");
  }

  if (
    /\b(?:el\s+)?(?:ano\s+(?:que\s+viene|proximo|siguiente)|proximo\s+ano|siguiente\s+ano)\b/.test(
      t,
    )
  ) {
    return sumarUnidad(hoy, 1, "ano");
  }

  // «el día 8 del mes que viene», «8 del próximo mes».
  const mesSiguiente = t.match(
    /\b(?:el\s+)?(?:dia\s+)?(\d{1,2})\s*(?:de|del)\s*(?:el\s+)?mes\s+(?:que\s+viene|proximo|siguiente)\b/,
  );
  if (mesSiguiente) {
    const { anio, mes } = sumarMeses(anioActual, mesActual, 1);
    return fechaValida(anio, mes, Number(mesSiguiente[1]));
  }

  // «el día 8 de este mes».
  const mesActualTexto = t.match(
    /\b(?:el\s+)?(?:dia\s+)?(\d{1,2})\s*(?:de|del)\s*(?:este|el\s+actual)\s+mes\b/,
  );
  if (mesActualTexto) {
    const fecha = fechaValida(anioActual, mesActual, Number(mesActualTexto[1]));
    if (fecha && fecha < hoy) {
      const { anio, mes } = sumarMeses(anioActual, mesActual, 1);
      return fechaValida(anio, mes, Number(mesActualTexto[1]));
    }
    return fecha;
  }

  // «el 8 de diciembre», «8 de diciembre de 2026».
  const conMes = t.match(
    /\b(?:el\s+)?(?:dia\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/,
  );
  if (conMes) {
    const mes = MESES.indexOf(conMes[2]) + 1;
    const anio = conMes[3] ? Number(conMes[3]) : anioActual;
    let fecha = fechaValida(anio, mes, Number(conMes[1]));

    // Sin año explícito, la próxima vez que caiga ese día.
    if (!conMes[3] && fecha && fecha < hoy) {
      fecha = fechaValida(anio + 1, mes, Number(conMes[1]));
    }

    if (fecha) return fecha;
  }

  // «8/12» o «8/12/2026».
  const barras = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (barras) {
    const anio = barras[3]
      ? Number(barras[3].length === 2 ? `20${barras[3]}` : barras[3])
      : anioActual;
    let fecha = fechaValida(anio, Number(barras[2]), Number(barras[1]));
    if (!barras[3] && fecha && fecha < hoy) {
      fecha = fechaValida(anio + 1, Number(barras[2]), Number(barras[1]));
    }
    if (fecha) return fecha;
  }

  // «el día 8» o «el 8», pero no «a las 8».
  const diaSuelto = t.match(/\b(?:el\s+dia\s+|el\s+)(\d{1,2})\b/);
  if (diaSuelto) {
    const posicion = diaSuelto.index ?? 0;
    const antes = t.slice(Math.max(0, posicion - 10), posicion);
    const dia = Number(diaSuelto[1]);

    if (!/(?:a\s+las?|sobre\s+las?|hacia\s+las?)\s*$/.test(antes)) {
      if (dia >= diaActual) {
        return fechaValida(anioActual, mesActual, dia);
      }
      const { anio, mes } = sumarMeses(anioActual, mesActual, 1);
      return fechaValida(anio, mes, dia);
    }
  }

  if (/\bpasado\s+manana\b/.test(t)) return addDias(hoy, 2);
  if (/\banteayer\b/.test(t)) return addDias(hoy, -2);
  if (/\bayer\b/.test(t)) return addDias(hoy, -1);
  if (/\b(?:manana|amanana)\b/.test(t)) return addDias(hoy, 1);
  if (/\bhoy\b/.test(t)) return hoy;

  const conDia = t.match(
    /\b(?:el|este|proximo|la)?\s*(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/,
  );
  if (conDia) {
    const objetivo = DIAS_SEMANA.indexOf(conDia[1]);
    const actual = new Date(`${hoy}T12:00:00Z`).getUTCDay();
    let delta = (objetivo - actual + 7) % 7;
    if (delta === 0) delta = 7;
    return addDias(hoy, delta);
  }

  if (/\b(?:la\s+)?(?:semana\s+que\s+viene|proxima\s+semana|siguiente\s+semana)\b/.test(t)) {
    return addDias(hoy, 7);
  }

  return null;
}

/**
 * Deduce una hora HH:mm. Reconoce «a las 9:30», «a las dos de la tarde»,
 * «9:30», «mediodía» y «medianoche». Devuelve null si no hay hora.
 */
export function horaDeTexto(texto: string): string | null {
  const t = normalizar(texto);

  if (/\bmediodia\b/.test(t)) return "12:00";
  if (/\bmedianoche\b/.test(t)) return "00:00";

  const palabras: Record<string, number> = {
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
  };

  const conPalabra = t.match(
    /\b(?:a\s+las?|sobre\s+las?|hacia\s+las?)\s+(una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+de\s+la\s+(manana|tarde|noche|madrugada))?\b/,
  );

  if (conPalabra) {
    let hora = palabras[conPalabra[1]];
    const momento = conPalabra[2];
    if (momento === "tarde" || momento === "noche") {
      if (hora < 12) hora += 12;
    } else if (!momento && hora >= 1 && hora <= 7) {
      hora += 12;
    }
    return `${String(hora).padStart(2, "0")}:00`;
  }

  const conFormato = t.match(
    /\b(?:a\s+las?|sobre\s+las?|hacia\s+las?)?\s*(\d{1,2}):(\d{2})\b/,
  );
  if (conFormato) {
    const hora = Number(conFormato[1]);
    const minuto = Number(conFormato[2]);
    if (hora <= 23 && minuto <= 59) {
      return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
    }
  }

  const conA = t.match(
    /\b(?:a\s+las?|sobre\s+las?|hacia\s+las?)\s+(\d{1,2})(?::(\d{2}))?(?:\s+de\s+la\s+(manana|tarde|noche|madrugada))?\b/,
  );
  if (conA) {
    let hora = Number(conA[1]);
    const minuto = conA[2] ? Number(conA[2]) : 0;
    const momento = conA[3];
    if (momento === "tarde" || momento === "noche") {
      if (hora < 12) hora += 12;
    } else if (!momento && hora >= 1 && hora <= 7) {
      hora += 12;
    }
    if (hora <= 23 && minuto <= 59) {
      return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
    }
  }

  return null;
}

export function rangoDeTexto(texto: string): RangoFechas {
  const t = normalizar(texto);

  if (/\b(?:la\s+)?(?:semana\s+que\s+viene|proxima\s+semana|siguiente\s+semana)\b/.test(t)) {
    return "semana_que_viene";
  }
  if (/\b(?:el\s+)?mes\s+(?:que\s+viene|proximo|siguiente)\b/.test(t)) {
    return "mes_que_viene";
  }
  if (/\b(?:este|el\s+actual)\s+mes\b/.test(t)) return "mes";
  if (/\b(?:esta|la)\s+semana\b/.test(t)) return "semana";
  if (/\bpasado\s+manana\b/.test(t)) return "todo";
  if (/\b(?:manana|amanana)\b/.test(t)) return "manana";
  if (/\bhoy\b/.test(t)) return "hoy";

  return "todo";
}

/** Primer y último día (YYYY-MM-DD) que abarca un rango. */
export function rangoFechas(
  rango: RangoFechas,
  hoy: string = hoyISO(),
): { desde: string; hasta: string } {
  const [anio, mes] = hoy.split("-").map(Number);
  const ultimo = ultimoDiaDelMes(anio, mes);

  if (rango === "hoy") return { desde: hoy, hasta: hoy };
  if (rango === "manana") {
    const manana = addDias(hoy, 1);
    return { desde: manana, hasta: manana };
  }
  if (rango === "semana") {
    const diaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay();
    const hasta = addDias(hoy, (7 - diaSemana) % 7);
    return { desde: hoy, hasta };
  }
  if (rango === "semana_que_viene") {
    const diaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay();
    const diasHastaLunes = ((8 - diaSemana) % 7) || 7;
    const desde = addDias(hoy, diasHastaLunes);
    return { desde, hasta: addDias(desde, 6) };
  }
  if (rango === "mes") {
    return { desde: `${hoy.slice(0, 7)}-01`, hasta: ultimo };
  }
  if (rango === "mes_que_viene") {
    const { anio: siguienteAnio, mes: siguienteMes } = sumarMeses(anio, mes, 1);
    return {
      desde: fechaValida(siguienteAnio, siguienteMes, 1) ?? `${hoy.slice(0, 7)}-01`,
      hasta: ultimoDiaDelMes(siguienteAnio, siguienteMes),
    };
  }

  return { desde: "0000-01-01", hasta: "9999-12-31" };
}

/** «8 dic 2026» */
export function fechaCorta(fecha: string): string {
  const texto = new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${fecha}T12:00:00Z`));

  return texto.replace(".", "");
}

/** «Lunes, 8 de diciembre de 2026» */
export function fechaLargaDia(fecha: string): string {
  const texto = new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${fecha}T12:00:00Z`));

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
