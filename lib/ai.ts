import { addDias, hoyISO, ZONA } from "./dates";
import { interpretarDestinoRapido, normalizarTexto } from "./destino";
import { fechaHoraLarga, madridAISO, partesMadrid } from "./recordatorios";
import { limpiarTitulo } from "./titulo";
import type { Clasificacion, DestinoResuelto, Tipo } from "./types";

const MODELO_POR_DEFECTO = "openai/gpt-oss-120b";
const URL_GROQ = "https://api.groq.com/openai/v1/chat/completions";

const TIPOS_VALIDOS: Tipo[] = ["hoy", "manana", "semana", "proyecto"];
const ACCIONES_VALIDAS: DestinoResuelto["accion"][] = [
  "hoy",
  "manana",
  "semana",
  "proyecto",
  "cancelar",
  "duda",
];

function construirPrompt(proyectos: string[]): string {
  const listaProyectos =
    proyectos.length > 0
      ? proyectos.map((p) => `- ${p}`).join("\n")
      : "(todavía no hay ningún proyecto)";

  return `Eres el clasificador de un gestor personal de tareas que recibe notas por Telegram.

Recibirás el texto de una nota (a veces desordenada, larga o transcrita de voz).
Devuelve SOLO un JSON válido, sin markdown ni explicaciones, con esta forma exacta:

{
  "tareas": [
    {
      "titulo": "resumen corto de máximo 8 palabras, en imperativo",
      "detalle": "el texto original, pulido pero sin recortar información",
      "tipo": "hoy" | "manana" | "semana" | "proyecto",
      "duracion_estimada_min": número entero o null si no se puede estimar,
      "paralelizable": true/false,
      "proyecto_sugerido": "nombre del proyecto si detecta que pertenece a uno existente, o null",
      "destino_claro": true/false
    }
  ]
}

Cuántas tareas devolver:
- Una sola si la nota cuenta una cosa, aunque sea larga.
- Varias (máximo 6) solo si la nota enumera acciones separadas: una por línea, con guiones o números, o unidas por «y» con verbos distintos («comprar pan y llamar a Ana»). Cada una con su título y su detalle.
- Nunca inventes tareas que no estén escritas.

PROYECTOS EXISTENTES:
${listaProyectos}

Reglas de clasificación de "tipo":
- "hoy": algo que se puede hacer en el día, urgente o puntual.
- "manana": si dice explícitamente "mañana" o "para mañana".
- "semana": tiene más margen pero no es un proyecto grande.
- "proyecto": si menciona o encaja con un proyecto ya existente en la lista, o si describe algo con varias fases.

Reglas de "destino_claro":
- true si el texto dice cuándo hacerlo (hoy, mañana, esta semana, el lunes...) o a qué proyecto pertenece.
- false si la nota solo nombra algo suelto sin decir cuándo ni dónde va (ej. "comprar pilas", "llamar a Ana"). En ese caso "tipo" es solo una suposición.

Reglas de "paralelizable":
- true si es una tarea que no requiere atención constante (ej. "series de rodaje suave", "dejar algo cocinando", "esperar una descarga").
- false si necesita atención plena o es una conversación/reunión.

Otras reglas:
- "titulo" siempre en imperativo y sin punto final.
- "titulo" es SOLO la accion: quita las expresiones de cuando o donde ("hoy", "manana", "para esta semana", "el lunes", "en el proyecto X"). Esas solo sirven para elegir "tipo" y "proyecto_sugerido". Ejemplo: "jugar al roblox para esta semana" -> titulo "Jugar al Roblox", tipo "semana".
- "detalle" conserva TODA la información del texto original; solo corrige puntuación, muletillas y transcripción.
- "duracion_estimada_min" es tu mejor estimación realista en minutos; null solo si es imposible deducirla.
- "proyecto_sugerido" debe coincidir con un nombre de la lista de proyectos existentes, o ser un nombre corto de proyecto nuevo si el texto pertenece claramente a uno que no está en la lista. Si no aplica, null.`;
}

function extraerJSON(texto: string): unknown {
  const limpio = texto
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(limpio);
  } catch {
    const inicio = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");
    if (inicio !== -1 && fin > inicio) {
      return JSON.parse(limpio.slice(inicio, fin + 1));
    }
    throw new Error("La IA no devolvió JSON válido");
  }
}

async function pedirJSON(sistema: string, usuario: string): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GROQ_API_KEY en el entorno del servidor");
  }

  const modelo = process.env.GROQ_MODEL?.trim() || MODELO_POR_DEFECTO;

  const respuesta = await fetch(URL_GROQ, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
    }),
  });

  if (!respuesta.ok) {
    const error = await respuesta.text();
    throw new Error(`Groq ${respuesta.status}: ${error.slice(0, 300)}`);
  }

  const data = (await respuesta.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const salida = data.choices?.[0]?.message?.content?.trim();
  if (!salida) throw new Error("Respuesta vacía de Groq");

  return extraerJSON(salida);
}

function normalizar(datos: unknown, textoOriginal: string): Clasificacion {
  const d = (datos ?? {}) as Record<string, unknown>;

  const tituloBruto =
    typeof d.titulo === "string" && d.titulo.trim().length > 0
      ? d.titulo.trim()
      : textoOriginal.trim().split(/\s+/).slice(0, 8).join(" ");

  // La coletilla de tiempo elige columna, no forma parte del título.
  const titulo = limpiarTitulo(tituloBruto).slice(0, 120);

  const tipo = TIPOS_VALIDOS.includes(d.tipo as Tipo)
    ? (d.tipo as Tipo)
    : "hoy";

  const duracion =
    typeof d.duracion_estimada_min === "number" &&
    Number.isFinite(d.duracion_estimada_min) &&
    d.duracion_estimada_min > 0
      ? Math.round(d.duracion_estimada_min)
      : null;

  const proyecto =
    typeof d.proyecto_sugerido === "string" &&
    d.proyecto_sugerido.trim().length > 0
      ? d.proyecto_sugerido.trim()
      : null;

  return {
    titulo,
    detalle:
      typeof d.detalle === "string" && d.detalle.trim().length > 0
        ? d.detalle.trim()
        : textoOriginal.trim(),
    tipo,
    duracion_estimada_min: duracion,
    paralelizable: d.paralelizable === true,
    proyecto_sugerido: proyecto,
    // Si el modelo no lo devuelve, no preguntamos: mantenemos el
    // comportamiento anterior de clasificar directamente.
    destino_claro: typeof d.destino_claro === "boolean" ? d.destino_claro : true,
  };
}

export async function clasificarTareas(
  texto: string,
  proyectos: string[],
): Promise<Clasificacion[]> {
  const datos = (await pedirJSON(
    construirPrompt(proyectos),
    `Texto de la nota:\n"""\n${texto}\n"""`,
  )) as Record<string, unknown>;

  const crudas = Array.isArray(datos.tareas) ? datos.tareas : [datos];

  const tareas = crudas
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizar(item, texto))
    .filter((tarea) => tarea.titulo.length > 0)
    .slice(0, 6);

  return tareas.length > 0 ? tareas : [normalizar({}, texto)];
}

/** Primera tarea de la nota (atajos de proyecto). */
export async function clasificarTarea(
  texto: string,
  proyectos: string[],
): Promise<Clasificacion> {
  const [tarea] = await clasificarTareas(texto, proyectos);
  return tarea;
}

export interface RecordatorioInterpretado {
  titulo: string;
  detalle: string;
  recordarAt: string | null;
}

const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

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

/** "Jueves, 5 de noviembre de 2026" (sin hora). */
function fechaLargaCompleta(fecha: string): string {
  const texto = new Intl.DateTimeFormat("es-ES", {
    timeZone: ZONA,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${fecha}T12:00:00Z`));

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Si el webhook añade «Cuándo: …», manda esa parte para la fecha. */
function soloCuando(texto: string): string {
  const coincidencia = texto.match(/Cu[aá]ndo:\s*([\s\S]+)$/i);
  return coincidencia ? coincidencia[1] : texto;
}

/**
 * Calcula la fecha de las expresiones más comunes sin preguntar al modelo:
 * «mañana», «pasado mañana», «ayer», «dentro de 3 días», «el lunes»…
 */
function fechaRelativaEnTexto(texto: string, hoy: string): string | null {
  const t = normalizarTexto(soloCuando(texto));

  const dentro = t.match(/\bdentro de (\d{1,3})\s*(dias?|semanas?)\b/);
  if (dentro) {
    return addDias(
      hoy,
      Number(dentro[1]) * (dentro[2].startsWith("semana") ? 7 : 1),
    );
  }

  const en = t.match(/\ben (\d{1,3})\s*(dias?|semanas?)\b/);
  if (en) {
    return addDias(hoy, Number(en[1]) * (en[2].startsWith("semana") ? 7 : 1));
  }

  if (/\bpasado\s+manana\b/.test(t)) return addDias(hoy, 2);
  if (/\banteayer\b/.test(t)) return addDias(hoy, -2);
  if (/\bayer\b/.test(t)) return addDias(hoy, -1);
  if (/\bmanana\s+por\s+la\s+manana\b/.test(t)) return addDias(hoy, 1);
  if (/\b(?:esta|por la|de la|toda la)\s+manana\b/.test(t)) return hoy;
  if (/\bmanana\b/.test(t)) return addDias(hoy, 1);
  if (/\bhoy\b/.test(t)) return hoy;

  if (
    /\b(?:la\s+)?(?:semana\s+que\s+viene|proxima\s+semana|siguiente\s+semana)\b/.test(
      t,
    )
  ) {
    return addDias(hoy, 7);
  }

  const conMes = t.match(
    /\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?\b/,
  );
  if (conMes) {
    const mes = String(MESES.indexOf(conMes[2]) + 1).padStart(2, "0");
    const dia = conMes[1].padStart(2, "0");
    const anio = conMes[3] ? Number(conMes[3]) : Number(hoy.slice(0, 4));
    const fecha = `${anio}-${mes}-${dia}`;

    if (!conMes[3] && fecha < hoy) return `${anio + 1}-${mes}-${dia}`;
    return fecha;
  }

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

  return null;
}

/**
 * Convierte «recuérdame el viernes a las 18:00 llamar a Ana» en un recordatorio
 * con fecha y hora en Madrid. Si el texto no dice cuándo, `recordarAt` es null.
 */
export async function interpretarRecordatorio(
  texto: string,
  actual?: { titulo: string; detalle: string; recordarAt: string },
): Promise<RecordatorioInterpretado> {
  const hoy = hoyISO();
  const horaActual = partesMadrid(new Date().toISOString()).hora;
  const fechaHoy = fechaLargaCompleta(hoy);

  let contextoActual = "";
  if (actual) {
    const { fecha, hora } = partesMadrid(actual.recordarAt);
    contextoActual = `

Recordatorio actual (cambia solo lo que pida el texto):
- asunto: ${actual.titulo}
- detalle: ${actual.detalle}
- cuándo: ${fecha} a las ${hora} (${fechaHoraLarga(actual.recordarAt)})`;
  }

  const sistema = `Eres el asistente de recordatorios de un gestor personal.

HOY ES ${fechaHoy} y son las ${horaActual} en Europe/Madrid. La fecha de hoy es ${hoy}.

Devuelve SOLO un JSON válido, sin markdown ni explicaciones:
{"titulo": "asunto corto en imperativo", "detalle": "texto original pulido", "fecha": "YYYY-MM-DD o null", "hora": "HH:mm o null"}

Reglas de fecha:
- Calcula siempre desde HOY (${hoy}). No cambies el año salvo que el texto lo diga: el año actual es ${hoy.slice(0, 4)}.
- «mañana» es ${addDias(hoy, 1)}; «pasado mañana» es ${addDias(hoy, 2)}; «ayer» es ${addDias(hoy, -1)}.
- «dentro de N días» suma N días; «la semana que viene» suma 7 días.
- «el lunes», «el viernes»… es la próxima vez que cae ese día; si hoy ya es ese día, el de la semana siguiente.
- Comprueba que el día de la semana coincide con la fecha: hoy ${hoy} es ${fechaLargaCompleta(hoy)}.
- «a las dos» son las 14:00 salvo que diga «de la madrugada»; «mediodía» son las 12:00; «medianoche» son las 00:00.
- Si no se dice hora, "hora" es null. Si no se puede deducir el día, "fecha" es null.
- "titulo" es solo el asunto: quita la fórmula de petición («recuérdame», «créame una alarma», «ponme un recordatorio», «avísame»…) y la parte de cuándo. Si el texto solo pide el aviso, el título puede ser "Alarma" o "Recordatorio".
- "detalle" conserva el resto de información útil del texto.${contextoActual}`;

  const datos = (await pedirJSON(
    sistema,
    `Texto: """${texto}"""`,
  )) as Record<string, unknown>;

  const titulo =
    typeof datos.titulo === "string" && datos.titulo.trim().length > 0
      ? limpiarTitulo(datos.titulo.trim()).slice(0, 120)
      : limpiarTitulo(texto.trim()).slice(0, 120);

  const detalle =
    typeof datos.detalle === "string" && datos.detalle.trim().length > 0
      ? datos.detalle.trim()
      : texto.trim();

  const fecha =
    typeof datos.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha.trim())
      ? datos.fecha.trim()
      : null;

  const hora =
    typeof datos.hora === "string" && /^\d{1,2}:\d{2}$/.test(datos.hora.trim())
      ? datos.hora.trim().padStart(5, "0")
      : null;

  // Para «mañana», «pasado mañana», «el lunes»… la fecha se calcula aquí:
  // así no depende de que el modelo acierte el año o el día de la semana.
  const fechaCalculada = fechaRelativaEnTexto(texto, hoy);

  let recordarAt: string | null = null;

  if (fechaCalculada || fecha || hora) {
    const base = actual ? partesMadrid(actual.recordarAt) : null;
    const dia = fechaCalculada ?? fecha ?? base?.fecha ?? null;
    const momento = hora ?? base?.hora ?? null;
    if (dia && momento) recordarAt = madridAISO(dia, momento);
  }

  if (!recordarAt && actual) recordarAt = actual.recordarAt;

  return { titulo, detalle, recordarAt };
}

/**
 * Interpreta la respuesta del usuario a la pregunta "¿dónde pongo esto?".
 * Devuelve a qué columna va (o si prefiere cancelarla).
 */
export async function interpretarDestino(
  texto: string,
  proyectos: string[],
  titulo: string,
): Promise<DestinoResuelto> {
  // Respuestas cortas («hoy», «en mañana», «cancela», el nombre de un
  // proyecto): se resuelven con reglas, sin llamar al modelo.
  const rapido = interpretarDestinoRapido(texto, proyectos);
  if (rapido) return rapido;

  const lista =
    proyectos.length > 0
      ? proyectos.map((p) => `- ${p}`).join("\n")
      : "(no hay proyectos todavía)";

  const sistema = `El usuario está decidiendo dónde guardar una tarea en un gestor personal.

Devuelve SOLO un JSON válido, sin markdown, con esta forma exacta:
{"accion": "hoy" | "manana" | "semana" | "proyecto" | "cancelar" | "duda", "proyecto": "nombre" | null}

Reglas:
- "hoy": dice hoy, ahora, esta tarde, esta noche, o algo urgente para el día.
- "manana": dice mañana, para mañana, o el día siguiente. Si menciona «mañana», es SIEMPRE "manana", nunca "semana".
- "semana": dice esta semana, los próximos días, luego, el lunes/martes, o algo sin prisa pero cercano.
- "proyecto": menciona un proyecto (de la lista o uno nuevo). "proyecto" debe ser el nombre exacto de la lista si coincide, o el nombre que haya dicho.
- "cancelar": dice cancela, olvídalo, bórralo, déjalo, nada, no era eso.
- "duda": no se entiende a qué se refiere.

PROYECTOS EXISTENTES:
${lista}`;

  const datos = (await pedirJSON(
    sistema,
    `Tarea pendiente: "${titulo}"\nRespuesta del usuario: "${texto}"`,
  )) as Record<string, unknown>;

  let accion = ACCIONES_VALIDAS.includes(datos.accion as DestinoResuelto["accion"])
    ? (datos.accion as DestinoResuelto["accion"])
    : "duda";

  // Red de seguridad por si el modelo vuelve a confundir «mañana» con semana.
  if (accion === "semana" && /\b(manana|amanana)\b/.test(normalizarTexto(texto))) {
    accion = "manana";
  }

  const proyecto =
    typeof datos.proyecto === "string" && datos.proyecto.trim().length > 0
      ? datos.proyecto.trim()
      : null;

  return { accion, proyecto };
}
