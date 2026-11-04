-- ============================================================
-- task-dashboard · esquema para InsForge (Postgres)
-- Aplícalo con:
--   npx @insforge/cli db query "$(cat insforge/schema.sql)"
-- o pegándolo en el SQL editor del dashboard de InsForge.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_tarea') then
    create type tipo_tarea as enum ('hoy', 'semana', 'proyecto');
  end if;
  if not exists (select 1 from pg_type where typname = 'estado_tarea') then
    create type estado_tarea as enum ('pendiente', 'hecha', 'sin_terminar');
  end if;
end $$;

create table if not exists public.proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  color text not null default '#D97757',
  created_at timestamptz not null default now()
);

create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text not null default '',
  tipo tipo_tarea not null default 'hoy',
  estado estado_tarea not null default 'pendiente',
  duracion_estimada_min integer,
  paralelizable boolean not null default false,
  proyecto_id uuid references public.proyectos (id) on delete set null,
  fecha_para date,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Notas cuyo destino (hoy / semana / proyecto) aún no está claro:
-- el webhook las guarda aquí y pregunta por Telegram.
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

-- Solo la usa el servidor (webhook), con la API_KEY de admin.
alter table public.tareas_pendientes enable row level security;

create index if not exists tareas_tipo_estado_idx on public.tareas (tipo, estado);
create index if not exists tareas_proyecto_idx on public.tareas (proyecto_id);
create index if not exists tareas_fecha_para_idx on public.tareas (fecha_para);
create index if not exists tareas_completed_at_idx on public.tareas (completed_at);

-- ------------------------------------------------------------
-- Seguridad
-- Dashboard personal sin login: la web usa la ANON_KEY y necesita
-- leer y escribir. El servidor (webhook/cron/plan) usa la API_KEY
-- de admin, que también queda cubierta por estas políticas.
-- No compartas la API_KEY y no uses este esquema para datos sensibles.
-- ------------------------------------------------------------
alter table public.proyectos enable row level security;
alter table public.tareas enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.proyectos to anon, authenticated;
grant select, insert, update, delete on public.tareas to anon, authenticated;

drop policy if exists "acceso personal proyectos" on public.proyectos;
create policy "acceso personal proyectos"
  on public.proyectos
  for all
  using (true)
  with check (true);

drop policy if exists "acceso personal tareas" on public.tareas;
create policy "acceso personal tareas"
  on public.tareas
  for all
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Proyectos de ejemplo (opcional, puedes borrar este bloque)
-- ------------------------------------------------------------
-- insert into public.proyectos (nombre, color) values
--   ('Casa', '#D97757'),
--   ('Trabajo', '#5B5DD6'),
--   ('Personal', '#22A06B');
