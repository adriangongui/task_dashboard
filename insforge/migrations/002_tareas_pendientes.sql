-- Tareas cuyo destino (hoy / semana / proyecto) aún no está claro.
-- El webhook guarda aquí la nota y pregunta por Telegram.

create table if not exists public.tareas_pendientes (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  texto text not null,
  titulo text not null,
  detalle text not null default '',
  duracion_estimada_min integer,
  paralelizable boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists tareas_pendientes_chat_idx
  on public.tareas_pendientes (chat_id);

-- Solo la usa el servidor (webhook) con la API_KEY de admin.
alter table public.tareas_pendientes enable row level security;
