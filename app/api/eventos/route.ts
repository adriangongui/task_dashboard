import {
  borrarEvento,
  actualizarEvento,
  guardarEvento,
  listarEventos,
} from "@/lib/eventosServer";
import {
  esCategoriaEvento,
  type CategoriaEvento,
} from "@/lib/eventos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fechaValida(valor: unknown): string | null {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? valor
    : null;
}

function horaValida(valor: unknown): string | null {
  if (valor === null || valor === "") return null;
  return typeof valor === "string" && /^\d{2}:\d{2}$/.test(valor)
    ? valor
    : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const desde = fechaValida(url.searchParams.get("desde")) ?? "1900-01-01";
    const hasta = fechaValida(url.searchParams.get("hasta")) ?? "2999-12-31";
    const categoria = url.searchParams.get("categoria");

    return Response.json({
      eventos: await listarEventos(
        desde,
        hasta,
        esCategoriaEvento(categoria) ? categoria : null,
      ),
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error listando eventos", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cuerpo = (await request.json()) as Record<string, unknown>;
    const titulo = typeof cuerpo.titulo === "string" ? cuerpo.titulo.trim() : "";
    const fecha = fechaValida(cuerpo.fecha);

    if (!titulo || !fecha) {
      return Response.json(
        { error: "Faltan el título o la fecha del evento." },
        { status: 400 },
      );
    }

    const evento = await guardarEvento({
      titulo: titulo.slice(0, 120),
      detalle: typeof cuerpo.detalle === "string" ? cuerpo.detalle.trim() : "",
      categoria: esCategoriaEvento(cuerpo.categoria)
        ? (cuerpo.categoria as CategoriaEvento)
        : "otro",
      fecha,
      hora: horaValida(cuerpo.hora),
    });

    return Response.json({ evento });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error creando evento", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const cuerpo = (await request.json()) as Record<string, unknown>;
    const id = typeof cuerpo.id === "string" ? cuerpo.id : "";

    if (!id) {
      return Response.json({ error: "Falta el evento." }, { status: 400 });
    }

    const fecha = fechaValida(cuerpo.fecha);
    const evento = await actualizarEvento(id, {
      ...(typeof cuerpo.titulo === "string"
        ? { titulo: cuerpo.titulo.trim().slice(0, 120) }
        : {}),
      ...(typeof cuerpo.detalle === "string"
        ? { detalle: cuerpo.detalle.trim() }
        : {}),
      ...(esCategoriaEvento(cuerpo.categoria)
        ? { categoria: cuerpo.categoria }
        : {}),
      ...(fecha ? { fecha } : {}),
      ...("hora" in cuerpo ? { hora: horaValida(cuerpo.hora) } : {}),
    });

    return Response.json({ evento });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error actualizando evento", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const cuerpo = (await request.json()) as { id?: string };
    if (!cuerpo.id) {
      return Response.json({ error: "Falta el evento." }, { status: 400 });
    }

    await borrarEvento(cuerpo.id);
    return Response.json({ ok: true });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "error desconocido";
    console.error("Error borrando evento", error);
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

