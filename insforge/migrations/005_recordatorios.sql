-- Recordatorios con hora exacta (aviso por Telegram) y ajustes del servidor.

create table if not exists public.recordatorios (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text not null default '',
  recordar_at timestamptz not null,
  enviado boolean not null default false,
  chat_id text,
  created_at timestamptz not null default now()
);

create index if not exists recordatorios_pendientes_idx
  on public.recordatorios (enviado, recordar_at);

alter table public.recordatorios enable row level security;

grant select, insert, update, delete on public.recordatorios to anon, authenticated;

drop policy if exists "acceso personal recordatorios" on public.recordatorios;
create policy "acceso personal recordatorios"
  on public.recordatorios
  for all
  using (true)
  with check (true);

-- Ajustes internos (token del cron de recordatorios). Solo servidor.
create table if not exists public.ajustes (
  clave text primary key,
  valor text not null,
  actualizado_at timestamptz not null default now()
);

alter table public.ajustes enable row level security;

insert into public.ajustes (clave, valor)
values ('recordatorios_token', md5(random()::text || clock_timestamp()::text))
on conflict (clave) do nothing;
