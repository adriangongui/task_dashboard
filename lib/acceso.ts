/**
 * Puerta de acceso del panel: una sola contraseña y una cookie firmada.
 *
 * La contraseña se puede fijar con APP_PASSWORD (texto) o APP_PASSWORD_HASH
 * (sha256 en hexadecimal). Si no hay ninguna, se usa la de siempre.
 */

export const COOKIE_SESION = "panel_sesion";
export const DURACION_SESION_SEGUNDOS = 60 * 60 * 24 * 30;

/** sha256 de la contraseña pedida, para no guardarla en claro en el repo. */
const HASH_POR_DEFECTO =
  "0b001d8c3e31e7e09b543ff4fb0770a63b2272dda1f275adcca13c7da44a224d";

const SECRETO_POR_DEFECTO = "task-dashboard-sesion-v1";

function aHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function digerir(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  return aHex(await crypto.subtle.digest("SHA-256", datos));
}

/** Comparación en tiempo constante para no filtrar la contraseña. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diferencia = 0;
  for (let i = 0; i < a.length; i += 1) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

export async function contrasenaCorrecta(intento: string): Promise<boolean> {
  const enClaro = process.env.APP_PASSWORD?.trim();
  if (enClaro) return iguales(intento.trim(), enClaro);

  const esperado = (
    process.env.APP_PASSWORD_HASH?.trim() || HASH_POR_DEFECTO
  ).toLowerCase();

  return iguales(await digerir(intento.trim()), esperado);
}

/** Valor de la cookie: HMAC del secreto, para que no se pueda inventar. */
export async function tokenSesion(): Promise<string> {
  const secreto =
    process.env.APP_SESSION_SECRET?.trim() || SECRETO_POR_DEFECTO;

  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const firma = await crypto.subtle.sign(
    "HMAC",
    clave,
    new TextEncoder().encode("panel-sesion-v1"),
  );

  return aHex(firma);
}

export async function sesionValida(valor: string | undefined): Promise<boolean> {
  if (!valor) return false;
  return iguales(valor, await tokenSesion());
}
