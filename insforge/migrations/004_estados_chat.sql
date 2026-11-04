-- Conversación abierta con el bot (qué proyecto, qué columna, qué tarea borrar)
-- y memoria de la última tarea creada, para «elimina la tarea anterior».

create table if not exists public.estados_chat (
  chat_id text primary key,
  accion text,
  datos jsonb not null default '{}'::jsonb,
  ultima_tarea_id uuid references public.tareas (id) on delete set null,
  actualizado_at timestamptz not null default now()
);

-- Solo la usa el servidor (webhook) con la API_KEY de admin.
alter table public.estados_chat enable row level security;
