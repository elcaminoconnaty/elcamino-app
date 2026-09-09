-- Cenas (2026-09-09): menú por reserva, elección por peregrino, enlace personal.
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.

-- Enlace personal de cada inscripción para elegir sus cenas (mismo criterio que
-- departures.travel_doc_token y contracts.access_token: 256 bits en claro, sin caducidad).
alter table public.registrations
  add column menu_token text unique,
  add column menu_token_created_at timestamptz;

-- Secciones del menú de una reserva ("entrada", "plato fuerte", …). El menú vive en la
-- reserva porque cambia por temporada; para no reescribirlo hay "copiar de la última vez".
create table public.reservation_menu_courses (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  course         text not null check (course in ('entrada','fuerte','postre','bebida','otro')),
  label          text,
  position       int  not null default 0,
  required       boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index reservation_menu_courses_reservation_idx on public.reservation_menu_courses(reservation_id);

create table public.reservation_menu_options (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.reservation_menu_courses(id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  description text,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);
create index reservation_menu_options_course_idx on public.reservation_menu_options(course_id);

-- Lo que eligió cada peregrino en cada sección. Sin fila = pendiente.
create table public.meal_choices (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  pilgrim_id     uuid not null references public.pilgrims(id) on delete cascade,
  course_id      uuid not null references public.reservation_menu_courses(id) on delete cascade,
  option_id      uuid not null references public.reservation_menu_options(id) on delete cascade,
  notes          text,
  chosen_via     text not null default 'equipo' check (chosen_via in ('peregrino','equipo')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (reservation_id, pilgrim_id, course_id)
);
create index meal_choices_reservation_idx on public.meal_choices(reservation_id);
create index meal_choices_pilgrim_idx on public.meal_choices(pilgrim_id);

-- Deriva reservation_id de la sección, comprueba que el plato sea de esa sección y que el
-- peregrino no esté marcado como que no cena.
create or replace function public.meal_choice_sync()
returns trigger language plpgsql as $$
begin
  select c.reservation_id into new.reservation_id
    from public.reservation_menu_courses c where c.id = new.course_id;
  if new.reservation_id is null then
    raise exception 'La sección del menú no existe';
  end if;
  if not exists (
    select 1 from public.reservation_menu_options o
    where o.id = new.option_id and o.course_id = new.course_id
  ) then
    raise exception 'El plato elegido no pertenece a esa sección del menú';
  end if;
  if exists (
    select 1 from public.reservation_opt_outs x
    where x.reservation_id = new.reservation_id and x.pilgrim_id = new.pilgrim_id and x.kind = 'cena'
  ) then
    raise exception 'Ese peregrino está marcado como que no cena esa noche';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger meal_choices_sync
  before insert or update on public.meal_choices
  for each row execute function public.meal_choice_sync();

-- La guarda inversa: no se marca "no cena" a quien ya eligió menú.
create or replace function public.reservation_opt_out_guard()
returns trigger language plpgsql as $$
begin
  if new.kind = 'hospedaje' and exists (
    select 1 from public.room_assignments ra
    where ra.reservation_id = new.reservation_id and ra.pilgrim_id = new.pilgrim_id
  ) then
    raise exception 'Ese peregrino ya tiene cama en esta reserva: sacalo de la habitación antes';
  end if;
  if new.kind = 'cena' and exists (
    select 1 from public.meal_choices mc
    where mc.reservation_id = new.reservation_id and mc.pilgrim_id = new.pilgrim_id
  ) then
    raise exception 'Ese peregrino ya eligió menú para esa cena: borrá la elección antes';
  end if;
  return new;
end;
$$;

alter table public.reservation_menu_courses enable row level security;
alter table public.reservation_menu_options enable row level security;
alter table public.meal_choices enable row level security;
create policy reservation_menu_courses_team_all on public.reservation_menu_courses
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy reservation_menu_options_team_all on public.reservation_menu_options
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy meal_choices_team_all on public.meal_choices
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
-- La página pública del peregrino usa la llave de servicio tras validar su token (como
-- /firmar): no hay políticas para anon.

-- Qué reservas son "cena": las de meal_kind = 'cena' (restaurantes, y hoteles que la
-- incluyen) o las que tienen habitaciones con cena incluida.
create or replace view public.v_dinner_reservations as
select r.departure_id, r.id as reservation_id, r.day_number, r.check_in, r.location,
       r.status as reservation_status, r.confirmation_ref, r.meal_persons, r.notes as reservation_notes,
       p.id as provider_id, p.name as provider_name, p.city as provider_city, p.address as provider_address,
       p.phone as provider_phone, p.email as provider_email,
       (r.meal_kind = 'cena') as via_meal_kind,
       exists (select 1 from public.reservation_rooms rr where rr.reservation_id = r.id and rr.includes_dinner) as via_rooms
  from public.reservations r
  join public.providers p on p.id = r.provider_id
 where r.status <> 'cancelado'
   and (r.meal_kind = 'cena'
        or exists (select 1 from public.reservation_rooms rr where rr.reservation_id = r.id and rr.includes_dinner));

-- Peregrino × cena × sección, con la elección si la hay (option_id null = pendiente).
create or replace view public.v_menu_choices as
select d.departure_id, d.reservation_id, d.day_number, d.check_in, d.location,
       d.provider_id, d.provider_name, d.provider_city, d.provider_address, d.provider_phone, d.provider_email,
       d.confirmation_ref, d.reservation_status, d.reservation_notes,
       reg.id as registration_id, pil.id as pilgrim_id, pil.full_name as pilgrim_name, pil.is_team, pil.dietary_notes,
       c.id as course_id, c.course, coalesce(c.label, c.course) as course_label, c.position as course_position, c.required,
       mc.id as choice_id, mc.option_id, o.name as option_name, mc.notes as choice_notes, mc.chosen_via, mc.updated_at as chosen_at,
       exists (select 1 from public.reservation_opt_outs x
               where x.reservation_id = d.reservation_id and x.pilgrim_id = pil.id and x.kind = 'cena') as opted_out
  from public.v_dinner_reservations d
  join public.registrations reg on reg.departure_id = d.departure_id and reg.status <> 'cancelado'
  join public.pilgrims pil on pil.id = reg.pilgrim_id and pil.deleted_at is null
  join public.reservation_menu_courses c on c.reservation_id = d.reservation_id
  left join public.meal_choices mc on mc.reservation_id = d.reservation_id and mc.pilgrim_id = pil.id and mc.course_id = c.id
  left join public.reservation_menu_options o on o.id = mc.option_id;

-- Guardado atómico del tablero de cenas. Conserva `chosen_via = 'peregrino'` cuando el
-- plato no cambió (el equipo no pisa lo que eligió cada uno por su enlace) y borra solo
-- las elecciones que no vienen en el payload.
--   p_dinners = [{ reservation_id, choices: [{pilgrim_id, course_id, option_id, notes}],
--                  opt_outs: [{pilgrim_id, reason}] }]
create or replace function public.save_meal_choices(p_departure_id uuid, p_dinners jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d      jsonb;
  v_res    uuid;
  v_rest   text;
  v_nombre text;
  v_cenas  int := 0;
  v_filas  int := 0;
  v_n      int;
begin
  if not public.is_team_member() then
    raise exception 'No autorizado';
  end if;
  if p_dinners is null or jsonb_typeof(p_dinners) <> 'array' then
    raise exception 'Formato inválido';
  end if;

  create temp table if not exists _ch (pilgrim_id uuid, course_id uuid, option_id uuid, notes text) on commit drop;
  create temp table if not exists _cop (pilgrim_id uuid, reason text) on commit drop;

  for v_d in select * from jsonb_array_elements(p_dinners) loop
    v_res := (v_d->>'reservation_id')::uuid;
    select provider_name into v_rest from public.v_dinner_reservations
     where reservation_id = v_res and departure_id = p_departure_id;
    if v_rest is null then
      raise exception 'Una de las cenas no es de este camino';
    end if;

    truncate _ch; truncate _cop;
    insert into _ch
      select (c->>'pilgrim_id')::uuid, (c->>'course_id')::uuid, (c->>'option_id')::uuid, nullif(c->>'notes','')
      from jsonb_array_elements(coalesce(v_d->'choices', '[]'::jsonb)) c;
    insert into _cop
      select (o->>'pilgrim_id')::uuid, nullif(o->>'reason','')
      from jsonb_array_elements(coalesce(v_d->'opt_outs', '[]'::jsonb)) o;

    if exists (
      select 1 from _ch x
      left join public.reservation_menu_courses c on c.id = x.course_id and c.reservation_id = v_res
      where c.id is null
    ) then
      raise exception '%: el menú cambió; recargá la página y volvé a elegir', v_rest;
    end if;
    if exists (
      select 1 from _ch x
      left join public.reservation_menu_options o on o.id = x.option_id and o.course_id = x.course_id
      where o.id is null
    ) then
      raise exception '%: hay un plato que ya no está en el menú', v_rest;
    end if;
    if exists (select 1 from _ch group by pilgrim_id, course_id having count(*) > 1) then
      raise exception '%: un peregrino quedó con dos platos en la misma sección', v_rest;
    end if;
    select p.full_name into v_nombre
      from _ch x join _cop o on o.pilgrim_id = x.pilgrim_id
      join public.pilgrims p on p.id = x.pilgrim_id
     limit 1;
    if v_nombre is not null then
      raise exception '%: % eligió menú y a la vez está marcado como que no cena', v_rest, v_nombre;
    end if;
    select p.full_name into v_nombre
      from (select pilgrim_id from _ch union select pilgrim_id from _cop) x
      join public.pilgrims p on p.id = x.pilgrim_id
     where not exists (
       select 1 from public.registrations reg
       where reg.pilgrim_id = x.pilgrim_id and reg.departure_id = p_departure_id
         and reg.status <> 'cancelado'
     )
     limit 1;
    if v_nombre is not null then
      raise exception '%: % ya no está inscrito en este camino', v_rest, v_nombre;
    end if;

    -- Orden por las guardas: se sacan elecciones y opt-outs viejos, luego se escribe.
    delete from public.meal_choices mc
     where mc.reservation_id = v_res
       and not exists (select 1 from _ch x where x.pilgrim_id = mc.pilgrim_id and x.course_id = mc.course_id);
    delete from public.reservation_opt_outs where reservation_id = v_res and kind = 'cena';
    insert into public.reservation_opt_outs (reservation_id, pilgrim_id, kind, reason, created_by)
      select v_res, pilgrim_id, 'cena', reason, auth.uid() from _cop;
    insert into public.meal_choices (reservation_id, pilgrim_id, course_id, option_id, notes, chosen_via)
      select v_res, pilgrim_id, course_id, option_id, notes, 'equipo' from _ch
    on conflict (reservation_id, pilgrim_id, course_id) do update
      set option_id  = excluded.option_id,
          notes      = excluded.notes,
          chosen_via = case when public.meal_choices.option_id = excluded.option_id
                            then public.meal_choices.chosen_via else 'equipo' end,
          updated_at = now();
    get diagnostics v_n = row_count;
    v_filas := v_filas + v_n;
    v_cenas := v_cenas + 1;
  end loop;

  return jsonb_build_object('cenas', v_cenas, 'elecciones', v_filas);
end;
$$;
revoke all on function public.save_meal_choices(uuid, jsonb) from public;
grant execute on function public.save_meal_choices(uuid, jsonb) to authenticated;
