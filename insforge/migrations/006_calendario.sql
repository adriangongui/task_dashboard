-- Tareas programadas con fecha futura y eventos del calendario.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'tipo_tarea' and e.enumlabel = 'programada'
  ) then
    alter type tipo_tarea add value 'programada';
  end if;
end $$;

create table if not exists public.calendario_eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text not null default '',
  categoria text not null default 'otro',
  fecha date not null,
  hora time,
  todo_el_dia boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists calendario_eventos_fecha_idx
  on public.calendario_eventos (fecha, hora);

alter table public.calendario_eventos enable row level security;

grant select, insert, update, delete on public.calendario_eventos
  to anon, authenticated;

drop policy if exists "acceso personal calendario" on public.calendario_eventos;
create policy "acceso personal calendario"
  on public.calendario_eventos
  for all
  using (true)
  with check (true);
