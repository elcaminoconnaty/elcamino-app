-- Formulario público de inscripción (2026-09-20): un enlace por camino, el peregrino
-- elige su nombre y completa sus datos (lo que antes era un Google Form).
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.

alter table public.departures
  add column registration_token text unique,
  add column registration_token_created_at timestamptz;

alter table public.pilgrims
  add column nickname text,
  add column instagram text,
  add column emergency_contact_relation text,
  add column shirt_size text check (shirt_size in ('XS','S','M','L','XL')),
  add column sandal_size int check (sandal_size between 35 and 42);

alter table public.registrations
  add column registration_form_submitted_at timestamptz,
  add column registration_form_raw jsonb;

-- Quien abre el enlace y no está en la lista deja una solicitud; el equipo la revisa y
-- decide si lo crea e inscribe. No se crea peregrino solo.
create table public.registration_requests (
  id            uuid primary key default gen_random_uuid(),
  departure_id  uuid not null references public.departures(id) on delete cascade,
  full_name     text not null check (length(btrim(full_name)) > 0),
  email         text,
  phone         text,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'pendiente' check (status in ('pendiente','aceptada','rechazada')),
  pilgrim_id    uuid references public.pilgrims(id) on delete set null,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid
);
create index registration_requests_departure_idx on public.registration_requests(departure_id, status);
alter table public.registration_requests enable row level security;
create policy registration_requests_team_all on public.registration_requests
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
-- La página pública escribe con la llave de servicio tras validar el token del camino:
-- no hay políticas para anon.
