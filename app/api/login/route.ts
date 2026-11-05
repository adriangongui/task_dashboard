import { NextResponse } from "next/server";
import {
  COOKIE_SESION,
  DURACION_SESION_SEGUNDOS,
  contrasenaCorrecta,
  tokenSesion,
} from "@/lib/acceso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let cuerpo: { password?: unknown };
  try {
    cuerpo = (await request.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const intento = typeof cuerpo.password === "string" ? cuerpo.password : "";

  if (!intento || !(await contrasenaCorrecta(intento))) {
    // Pequeña espera para frenar pruebas de contraseña a lo bruto.
    await new Promise((listo) => setTimeout(listo, 500));
    return NextResponse.json(
      { error: "Contraseña incorrecta." },
      { status: 401 },
    );
  }

  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(COOKIE_SESION, await tokenSesion(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACION_SESION_SEGUNDOS,
  });

  return respuesta;
}
