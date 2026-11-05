"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: contrasena }),
      });

      if (!respuesta.ok) {
        const datos = (await respuesta.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(datos.error ?? "No se pudo entrar.");
        setContrasena("");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("No hay conexión con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[380px] rounded-panel border border-line bg-white px-6 py-7 shadow-card sm:px-7">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-ink text-white"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4.75" y="10.5" width="14.5" height="9.25" rx="2.5" />
              <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
            </svg>
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Task Dashboard
            </p>
            <h1 className="text-[17px] font-semibold tracking-[-0.01em]">
              Tus tareas, solo para ti
            </h1>
          </div>
        </div>

        <form onSubmit={entrar} className="space-y-3">
          <div>
            <label
              htmlFor="contrasena"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
            >
              Contraseña
            </label>
            <input
              id="contrasena"
              type="password"
              value={contrasena}
              onChange={(evento) => {
                setContrasena(evento.target.value);
                if (error) setError(null);
              }}
              autoComplete="current-password"
              autoFocus
              className="w-full rounded-[12px] border border-line bg-canvas/70 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted/70 focus:border-hoy/45 focus:bg-white"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p role="alert" className="text-xs text-sinterminar">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={enviando || contrasena.length === 0}
            className="w-full rounded-[11px] bg-ink px-3.5 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[#111110] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
          Este panel es privado. Si olvidas la contraseña, se cambia en la
          configuración del proyecto.
        </p>
      </div>
    </main>
  );
}
