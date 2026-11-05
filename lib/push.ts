import webpush from "web-push";
import { insforgeServer } from "./insforge/server";

export interface SuscripcionPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  creada: string;
}

interface ClavesVapid {
  publica: string;
  privada: string;
}

const CLAVE_SUSCRIPCIONES = "push_suscripciones";
const CLAVE_VAPID_PUBLICA = "vapid_publica";
const CLAVE_VAPID_PRIVADA = "vapid_privada";
const ASUNTO =
  process.env.VAPID_SUBJECT ?? "mailto:recordatorios@task-dashboard.app";
const MAXIMO_SUSCRIPCIONES = 10;

let vapidCache: ClavesVapid | null = null;
let vapidEnCurso: Promise<ClavesVapid> | null = null;

async function leerAjuste(clave: string): Promise<string | null> {
  const { data, error } = await insforgeServer()
    .database.from("ajustes")
    .select("valor")
    .eq("clave", clave)
    .limit(1);

  if (error) throw error;

  return (data as Array<{ valor?: string | null }> | null)?.[0]?.valor ?? null;
}

async function escribirAjuste(clave: string, valor: string): Promise<void> {
  const db = insforgeServer().database;

  const { data, error } = await db
    .from("ajustes")
    .update({ valor })
    .eq("clave", clave)
    .select("clave");

  if (error) throw error;

  if ((data as unknown[] | null)?.length) return;

  const { error: errorInsert } = await db
    .from("ajustes")
    .insert([{ clave, valor }]);

  if (errorInsert) throw errorInsert;
}

function esSuscripcion(valor: unknown): valor is SuscripcionPush {
  if (!valor || typeof valor !== "object") return false;

  const suscripcion = valor as Partial<SuscripcionPush>;
  return (
    typeof suscripcion.endpoint === "string" &&
    suscripcion.endpoint.startsWith("https://") &&
    typeof suscripcion.keys?.p256dh === "string" &&
    suscripcion.keys.p256dh.length > 0 &&
    typeof suscripcion.keys?.auth === "string" &&
    suscripcion.keys.auth.length > 0
  );
}

export async function suscripcionesPush(): Promise<SuscripcionPush[]> {
  const crudo = await leerAjuste(CLAVE_SUSCRIPCIONES);
  if (!crudo) return [];

  try {
    const guardadas: unknown = JSON.parse(crudo);
    return Array.isArray(guardadas) ? guardadas.filter(esSuscripcion) : [];
  } catch {
    return [];
  }
}

export async function guardarSuscripcion(
  datos: Pick<SuscripcionPush, "endpoint" | "keys">,
): Promise<number> {
  const actuales = await suscripcionesPush();
  const otras = actuales.filter(
    (suscripcion) => suscripcion.endpoint !== datos.endpoint,
  );

  const siguiente = [
    ...otras,
    {
      endpoint: datos.endpoint,
      keys: { p256dh: datos.keys.p256dh, auth: datos.keys.auth },
      creada: new Date().toISOString(),
    },
  ].slice(-MAXIMO_SUSCRIPCIONES);

  await escribirAjuste(CLAVE_SUSCRIPCIONES, JSON.stringify(siguiente));
  return siguiente.length;
}

export async function borrarSuscripciones(
  endpoints: string[],
): Promise<void> {
  if (endpoints.length === 0) return;

  const actuales = await suscripcionesPush();
  const siguientes = actuales.filter(
    (suscripcion) => !endpoints.includes(suscripcion.endpoint),
  );

  if (siguientes.length === actuales.length) return;

  await escribirAjuste(CLAVE_SUSCRIPCIONES, JSON.stringify(siguientes));
}

async function cargarClaves(): Promise<ClavesVapid> {
  const publica = process.env.VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (publica && privada) return { publica, privada };

  const [guardadaPublica, guardadaPrivada] = await Promise.all([
    leerAjuste(CLAVE_VAPID_PUBLICA),
    leerAjuste(CLAVE_VAPID_PRIVADA),
  ]);

  if (guardadaPublica && guardadaPrivada) {
    return { publica: guardadaPublica, privada: guardadaPrivada };
  }

  const nuevas = webpush.generateVAPIDKeys();
  await escribirAjuste(CLAVE_VAPID_PUBLICA, nuevas.publicKey);
  await escribirAjuste(CLAVE_VAPID_PRIVADA, nuevas.privateKey);

  return { publica: nuevas.publicKey, privada: nuevas.privateKey };
}

/**
 * Claves VAPID estables. Usa las variables de entorno si existen y, si no,
 * genera un par la primera vez y lo guarda en `ajustes` para no repetirlo.
 */
export async function clavesVapid(): Promise<ClavesVapid> {
  if (vapidCache) return vapidCache;

  if (!vapidEnCurso) {
    vapidEnCurso = cargarClaves().finally(() => {
      vapidEnCurso = null;
    });
  }

  vapidCache = await vapidEnCurso;
  return vapidCache;
}

/**
 * Manda el aviso a todos los dispositivos suscritos. Devuelve cuántos lo
 * recibieron y borra las suscripciones que el servicio push ya no reconoce.
 */
export async function enviarPushRecordatorio(aviso: {
  id: string;
  titulo: string;
  detalle?: string | null;
}): Promise<number> {
  try {
    const suscripciones = await suscripcionesPush();
    if (suscripciones.length === 0) return 0;

    const { publica, privada } = await clavesVapid();
    webpush.setVapidDetails(ASUNTO, publica, privada);

    const detalle = (aviso.detalle ?? "").trim();
    const cuerpo =
      detalle && detalle !== aviso.titulo.trim()
        ? detalle
        : "Es la hora de tu recordatorio.";

    const carga = JSON.stringify({
      title: `⏰ ${aviso.titulo}`,
      body: cuerpo,
      url: "/?recordatorios=1",
      tag: `recordatorio-${aviso.id}`,
    });

    let enviados = 0;
    const caducadas: string[] = [];

    await Promise.all(
      suscripciones.map(async (suscripcion) => {
        try {
          await webpush.sendNotification(
            { endpoint: suscripcion.endpoint, keys: suscripcion.keys },
            carga,
            { TTL: 3600, urgency: "high" },
          );
          enviados += 1;
        } catch (error) {
          const estado = (error as { statusCode?: number }).statusCode;
          if (estado === 404 || estado === 410) {
            caducadas.push(suscripcion.endpoint);
            return;
          }

          console.error(
            "No se pudo enviar el aviso push",
            estado,
            error instanceof Error ? error.message : error,
          );
        }
      }),
    );

    if (caducadas.length > 0) await borrarSuscripciones(caducadas);

    return enviados;
  } catch (error) {
    console.error("Error preparando los avisos push", error);
    return 0;
  }
}
