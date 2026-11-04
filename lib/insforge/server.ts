import { createAdminClient } from "@insforge/sdk";

/**
 * Cliente de servidor. Usa la API_KEY de admin (ik_...) cuando existe, porque
 * el webhook de Telegram y el cron escriben sin usuario autenticado, y cae a
 * la anon key para que /api/plan-dia funcione en local sin la clave privada.
 */
export function insforgeServer(): ReturnType<typeof createAdminClient> {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  const apiKey =
    process.env.INSFORGE_API_KEY ?? process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_INSFORGE_URL y INSFORGE_API_KEY en el entorno del servidor.",
    );
  }

  return createAdminClient({ baseUrl, apiKey });
}
