import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, sesionValida } from "@/lib/acceso";

const RUTAS_PUBLICAS = ["/login", "/api/login"];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const dentro = await sesionValida(request.cookies.get(COOKIE_SESION)?.value);

  if (pathname === "/login") {
    if (dentro) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (dentro) return NextResponse.next();

  if (RUTAS_PUBLICAS.includes(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "No autorizado. Entra desde el panel." },
      { status: 401 },
    );
  }

  const destino = new URL("/login", request.url);
  if (pathname !== "/") {
    destino.searchParams.set("siguiente", pathname + search);
  }

  return NextResponse.redirect(destino);
}

export const config = {
  // Quedan fuera: recursos estáticos, el login, el webhook del bot y el cron.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-touch-icon|icons/|sw.js|service-worker.js|manifest.webmanifest|robots.txt|api/login|api/telegram|api/cron|api/recordatorios/enviar).*)",
  ],
};
