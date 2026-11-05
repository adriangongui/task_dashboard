import { clavesVapid } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { publica } = await clavesVapid();

    return Response.json(
      { clave: publica },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error generando la clave push", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
