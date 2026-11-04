"use client";

import { createClient } from "@insforge/sdk";

let cliente: ReturnType<typeof createClient> | null = null;

export function insforgeBrowser(): ReturnType<typeof createClient> {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

  if (!baseUrl || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_INSFORGE_URL o NEXT_PUBLIC_INSFORGE_ANON_KEY. Revisa tu .env.local.",
    );
  }

  if (!cliente) {
    cliente = createClient({ baseUrl, anonKey });
  }

  return cliente;
}

export function insforgeConfigurado(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_INSFORGE_URL &&
      process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
  );
}
