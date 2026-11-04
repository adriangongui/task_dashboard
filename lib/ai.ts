import type { Clasificacion, Tipo } from "./types";

const MODELO_POR_DEFECTO = "openai/gpt-oss-120b";
const URL_GROQ = "https://api.groq.com/openai/v1/chat/completions";

const TIPOS_VALIDOS: Tipo[] = ["hoy", "semana", "proyecto"];

function construirPrompt(proyectos: string[]): string {
  const listaProyectos =
    proyectos.length > 0
      ? proyectos.map((p) => `- ${p}`).join("\n")
      : "(todavía no hay ningún proyecto)";

  return `Eres el clasificador de un gestor personal de tareas que recibe notas por Telegram.

Recibirás el texto de una nota (a veces desordenada, larga o transcrita de voz).
Devuelve SOLO un JSON válido, sin markdown ni explicaciones, con esta forma exacta:

{
  "titulo": "resumen corto de máximo 8 palabras, en imperativo",
  "detalle": "el texto original, pulido pero sin recortar información",
  "tipo": "hoy" | "semana" | "proyecto",
  "duracion_estimada_min": número entero o null si no se puede estimar,
  "paralelizable": true/false,
  "proyecto_sugerido": "nombre del proyecto si detecta que pertenece a uno existente, o null"
}

PROYECTOS EXISTENTES:
${listaProyectos}

Reglas de clasificación de "tipo":
- "hoy": algo que se puede hacer en el día, urgente o puntual.
- "semana": tiene más margen pero no es un proyecto grande.
- "proyecto": si menciona o encaja con un proyecto ya existente en la lista, o si describe algo con varias fases.

Reglas de "paralelizable":
- true si es una tarea que no requiere atención constante (ej. "series de rodaje suave", "dejar algo cocinando", "esperar una descarga").
- false si necesita atención plena o es una conversación/reunión.

Otras reglas:
- "titulo" siempre en imperativo y sin punto final.
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

function normalizar(datos: unknown, textoOriginal: string): Clasificacion {
  const d = (datos ?? {}) as Record<string, unknown>;

  const titulo =
    typeof d.titulo === "string" && d.titulo.trim().length > 0
      ? d.titulo.trim().slice(0, 120)
      : textoOriginal.trim().split(/\s+/).slice(0, 8).join(" ");

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
  };
}

export async function clasificarTarea(
  texto: string,
  proyectos: string[],
): Promise<Clasificacion> {
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
        { role: "system", content: construirPrompt(proyectos) },
        {
          role: "user",
          content: `Texto de la nota:\n"""\n${texto}\n"""`,
        },
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

  return normalizar(extraerJSON(salida), texto);
}
