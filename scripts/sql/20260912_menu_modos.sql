-- Cenas (2026-09-12): interruptor "pedir menú" por reserva, modos por sección
-- (elige el peregrino / igual para todos / se elige en el restaurante), nota para el
-- peregrino y secciones condicionales ("Primero" solo si eligió "Menú completo").
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.

-- 1. Qué reservas piden menú se decide con un interruptor explícito, no se deduce.
--    Antes bastaba meal_kind = 'cena' o una habitación con cena incluida, y así
--    Araguaney (hotel, sin cena del grupo) pedía menú sin tener que pedirlo.
alter table public.reservations
  add column menu_required boolean not null default false,
  add column menu_notes_pilgrim text;

update public.reservations r
   set menu_required = true
 where r.status <> 'cancelado'
   and (r.meal_kind = 'cena'
        or exists (select 1 from public.reservation_rooms rr where rr.reservation_id = r.id and rr.includes_dinner));

-- Arreglo de datos: Hotel Araguaney 2026-10-02 estaba marcado como cena; esa noche el
-- grupo cena en el Parador.
update public.reservations
   set meal_kind = null, menu_required = false
 where id = '60c4b40e-3d62-4189-984d-7ba4bd33fd22';

-- 2. Modo de cada sección y de qué opción depende (condicional).
--    'fijo'     → el equipo carga un solo plato, va para todos, el peregrino no elige.
--    'en_sitio' → se elige en el restaurante; no lleva platos ni se manda al proveedor.
alter table public.reservation_menu_courses
  add column mode text not null default 'peregrino' check (mode in ('peregrino','fijo','en_sitio')),
  add column depends_on_option_id uuid references public.reservation_menu_options(id) on delete set null;
create index reservation_menu_courses_depends_idx on public.reservation_menu_courses(depends_on_option_id);

-- La opción de la que depende una sección tiene que ser de otra sección de la misma
-- reserva, que vaya antes y que la elija el peregrino.
create or replace function public.menu_course_guard()
returns trigger language plpgsql as $$
declare
  v_res    uuid;
  v_parent uuid;
  v_pos    int;
  v_mode   text;
begin
  if new.depends_on_option_id is not null then
    select c.reservation_id, c.id, c.position, c.mode into v_res, v_parent, v_pos, v_mode
      from public.reservation_menu_options o
      join public.reservation_menu_courses c on c.id = o.course_id
     where o.id = new.depends_on_option_id;
    if v_res is null or v_res <> new.reservation_id then
      raise exception 'La opción de la que depende no es de esta cena';
    end if;
    if v_parent = new.id then
      raise exception 'Una sección no puede depender de sí misma';
    end if;
    if v_mode <> 'peregrino' then
      raise exception 'Solo se puede depender de una sección que elige el peregrino';
    end if;
    if v_pos >= new.position then
      raise exception 'La sección de la que depende tiene que ir antes';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger reservation_menu_courses_guard
  before insert or update on public.reservation_menu_courses
  for each row execute function public.menu_course_guard();

-- 3. Solo se elige en secciones que elige el peregrino.
create or replace function public.meal_choice_sync()
returns trigger language plpgsql as $$
declare
  v_mode text;
begin
  select c.reservation_id, c.mode into new.reservation_id, v_mode
    from public.reservation_menu_courses c where c.id = new.course_id;
  if new.reservation_id is null then
    raise exception 'La sección del menú no existe';
  end if;
  if v_mode <> 'peregrino' then
    raise exception 'Esa sección no la elige el peregrino';
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

-- 4. Borra las elecciones de secciones condicionales cuya opción padre ya no está
--    elegida (cambió de "Menú completo" a "Pizza": el primero y el segundo sobran).
--    La llaman el RPC del tablero y el enlace público.
create or replace function public.prune_dependent_choices(p_reservation_id uuid, p_pilgrim_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  delete from public.meal_choices mc
   using public.reservation_menu_courses c
   where mc.course_id = c.id
     and mc.reservation_id = p_reservation_id
     and (p_pilgrim_id is null or mc.pilgrim_id = p_pilgrim_id)
     and c.depends_on_option_id is not null
     and not exists (
       select 1 from public.meal_choices padre
        where padre.reservation_id = mc.reservation_id
          and padre.pilgrim_id = mc.pilgrim_id
          and padre.option_id = c.depends_on_option_id
     );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.prune_dependent_choices(uuid, uuid) from public;
grant execute on function public.prune_dependent_choices(uuid, uuid) to authenticated, service_role;

-- 5. Vistas: la lista de cenas sale del interruptor. Se agregan columnas al final.
create or replace view public.v_dinner_reservations as
select r.departure_id, r.id as reservation_id, r.day_number, r.check_in, r.location,
       r.status as reservation_status, r.confirmation_ref, r.meal_persons, r.notes as reservation_notes,
       p.id as provider_id, p.name as provider_name, p.city as provider_city, p.address as provider_address,
       p.phone as provider_phone, p.email as provider_email,
       (r.meal_kind = 'cena') as via_meal_kind,
       exists (select 1 from public.reservation_rooms rr where rr.reservation_id = r.id and rr.includes_dinner) as via_rooms,
       r.menu_notes_pilgrim,
       p.contact_name as provider_contact_name
  from public.reservations r
  join public.providers p on p.id = r.provider_id
 where r.status <> 'cancelado'
   and r.menu_required;

create or replace view public.v_menu_choices as
select d.departure_id, d.reservation_id, d.day_number, d.check_in, d.location,
       d.provider_id, d.provider_name, d.provider_city, d.provider_address, d.provider_phone, d.provider_email,
       d.confirmation_ref, d.reservation_status, d.reservation_notes,
       reg.id as registration_id, pil.id as pilgrim_id, pil.full_name as pilgrim_name, pil.is_team, pil.dietary_notes,
       c.id as course_id, c.course, coalesce(c.label, c.course) as course_label, c.position as course_position, c.required,
       mc.id as choice_id, mc.option_id, o.name as option_name, mc.notes as choice_notes, mc.chosen_via, mc.updated_at as chosen_at,
       exists (select 1 from public.reservation_opt_outs x
               where x.reservation_id = d.reservation_id and x.pilgrim_id = pil.id and x.kind = 'cena') as opted_out,
       c.mode, c.depends_on_option_id,
       (select o2.name from public.reservation_menu_options o2 where o2.course_id = c.id order by o2.position, o2.name limit 1) as first_option_name
  from public.v_dinner_reservations d
  join public.registrations reg on reg.departure_id = d.departure_id and reg.status <> 'cancelado'
  join public.pilgrims pil on pil.id = reg.pilgrim_id and pil.deleted_at is null
  join public.reservation_menu_courses c on c.reservation_id = d.reservation_id
  left join public.meal_choices mc on mc.reservation_id = d.reservation_id and mc.pilgrim_id = pil.id and mc.course_id = c.id
  left join public.reservation_menu_options o on o.id = mc.option_id;

-- 6. El RPC del tablero: además de lo de antes, no acepta elecciones en secciones que no
--    elige el peregrino y limpia las condicionales huérfanas al final.
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
      join public.reservation_menu_courses c on c.id = x.course_id
      where c.mode <> 'peregrino'
    ) then
      raise exception '%: hay una elección en una sección que no elige el peregrino', v_rest;
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
    perform public.prune_dependent_choices(v_res, null);
    v_filas := v_filas + v_n;
    v_cenas := v_cenas + 1;
  end loop;

  return jsonb_build_object('cenas', v_cenas, 'elecciones', v_filas);
end;
$$;
