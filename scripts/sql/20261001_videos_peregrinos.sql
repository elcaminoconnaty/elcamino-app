-- Videos personalizados para cada peregrino (2026-09-29): mensajes de su gente que se
-- entregan en el camino. El archivo vive en el bucket privado de Railway
-- (`videos-peregrinos`); acá solo va la llave del objeto y el enlace personal.
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.
create table public.pilgrim_videos (
  id               uuid primary key default gen_random_uuid(),
  registration_id  uuid not null references public.registrations(id) on delete cascade,
  -- Enlace personal /video/<token>: 256 bits, independiente del token del formulario.
  token            text not null unique check (token ~ '^[0-9a-f]{64}$'),
  storage_key      text not null,
  original_name    text,
  -- Como le dicen ("Maria Elena", "Liz"): sale del rótulo del archivo, no del nombre del pasaporte.
  nombre           text,
  duration_s       numeric,
  width            int,
  height           int,
  size_bytes       bigint,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  first_viewed_at  timestamptz,
  last_viewed_at   timestamptz,
  view_count       int not null default 0
);
create index pilgrim_videos_registration_idx on public.pilgrim_videos(registration_id);
alter table public.pilgrim_videos enable row level security;
create policy pilgrim_videos_team_all on public.pilgrim_videos
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
-- La página pública lee con la llave de servicio tras validar el token: no hay políticas para anon.
