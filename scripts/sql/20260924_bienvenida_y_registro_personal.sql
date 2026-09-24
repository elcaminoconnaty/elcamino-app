-- Aplicada en producción el 2026-09-24 con apply_migration (bienvenida_y_registro_personal).
-- Copia de referencia: la base viva es la fuente de verdad.

-- Enlace personal del formulario de registro, uno por inscripción (no muestra a nadie más).
alter table public.registrations
  add column if not exists form_token text,
  add column if not exists form_token_created_at timestamptz,
  add column if not exists form_sent_at timestamptz,
  add column if not exists welcome_sent_at timestamptz;
create unique index if not exists registrations_form_token_key on public.registrations (form_token) where form_token is not null;
comment on column public.registrations.form_token is 'Token de 256 bits del enlace personal del formulario de registro (/registro/<token>). Se genera la primera vez que el equipo lo copia.';
comment on column public.registrations.form_sent_at is 'Cuándo el equipo mandó (o copió) el enlace del formulario.';
comment on column public.registrations.welcome_sent_at is 'Cuándo el equipo mandó la carta de bienvenida.';

-- Lo que la lectura automática sacó del pasaporte, guardado aparte para compararlo con lo que la persona escribe.
alter table public.pilgrims add column if not exists passport_ocr jsonb;
comment on column public.pilgrims.passport_ocr is 'Última lectura automática del pasaporte: {passport_number, birth_date, passport_expiry_date, full_name, mrz, confidence, leido_el}. No se edita a mano.';

-- Datos de la carta de bienvenida que no salen de la ruta (lugar exacto del encuentro, notas).
alter table public.departures add column if not exists welcome_letter jsonb;
comment on column public.departures.welcome_letter is 'Ajustes de la carta de bienvenida: {encuentro_lugar, encuentro_hora, cierre_texto}. Lo demás sale de la ruta y las fechas.';

update public.departures
   set welcome_letter = jsonb_build_object('encuentro_lugar', 'Estación Chamartín, Madrid')
 where welcome_letter is null and origin_city ilike 'madrid';

-- (sandalias_hasta_45) Hay hombres en los grupos: las tallas llegan hasta la 45.
alter table public.pilgrims drop constraint if exists pilgrims_sandal_size_check;
alter table public.pilgrims add constraint pilgrims_sandal_size_check check (sandal_size between 35 and 45);
