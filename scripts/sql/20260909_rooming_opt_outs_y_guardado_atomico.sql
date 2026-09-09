-- Rooming list (2026-09-09): "no duerme acá" + guardado atómico del tablero.
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.

-- 1. Opt-outs genéricos por (reserva, peregrino, clase). Una misma reserva puede ser
--    hospedaje y cena a la vez (Araguaney noche 1 incluye la cena), así que "no duerme"
--    y "no cena" son decisiones distintas y por eso está `kind`.
create table public.reservation_opt_outs (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  pilgrim_id     uuid not null references public.pilgrims(id) on delete cascade,
  kind           text not null check (kind in ('hospedaje','cena')),
  reason         text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (reservation_id, pilgrim_id, kind)
);
create index reservation_opt_outs_reservation_idx on public.reservation_opt_outs(reservation_id);
create index reservation_opt_outs_pilgrim_idx on public.reservation_opt_outs(pilgrim_id);
alter table public.reservation_opt_outs enable row level security;
create policy reservation_opt_outs_team_all on public.reservation_opt_outs
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- 2a. Nadie con cama y "no duerme" a la vez. Va dentro del trigger que ya deriva
--     reservation_id para no depender del orden alfabético de triggers.
create or replace function public.room_assignment_sync_reservation()
returns trigger language plpgsql as $$
begin
  select rr.reservation_id into new.reservation_id
  from public.reservation_rooms rr
  where rr.id = new.reservation_room_id;
  if new.reservation_id is null then
    raise exception 'reservation_room_id % no existe', new.reservation_room_id;
  end if;
  if exists (
    select 1 from public.reservation_opt_outs o
    where o.reservation_id = new.reservation_id
      and o.pilgrim_id = new.pilgrim_id
      and o.kind = 'hospedaje'
  ) then
    raise exception 'Ese peregrino está marcado como que no duerme en esta reserva';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 2b. Y al revés: no se marca "no duerme" a quien ya tiene cama.
create or replace function public.reservation_opt_out_guard()
returns trigger language plpgsql as $$
begin
  if new.kind = 'hospedaje' and exists (
    select 1 from public.room_assignments ra
    where ra.reservation_id = new.reservation_id and ra.pilgrim_id = new.pilgrim_id
  ) then
    raise exception 'Ese peregrino ya tiene cama en esta reserva: sacalo de la habitación antes';
  end if;
  return new;
end;
$$;
create trigger reservation_opt_outs_guard
  before insert or update on public.reservation_opt_outs
  for each row execute function public.reservation_opt_out_guard();

-- 3. Guardado atómico de todo el tablero. Una sola transacción: si una noche viene mal,
--    no se toca ninguna. Los mensajes van en español porque llegan tal cual a la pantalla.
--    p_nights = [{ reservation_id, assignments: [{reservation_room_id, room_index, pilgrim_id}],
--                  opt_outs: [{pilgrim_id, reason}] }]
create or replace function public.save_rooming_board(p_departure_id uuid, p_nights jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_night  jsonb;
  v_res    uuid;
  v_hotel  text;
  v_nombre text;
  v_noches int := 0;
  v_filas  int := 0;
  v_n      int;
begin
  if not public.is_team_member() then
    raise exception 'No autorizado';
  end if;
  if p_nights is null or jsonb_typeof(p_nights) <> 'array' then
    raise exception 'Formato inválido';
  end if;

  create temp table if not exists _asg (
    reservation_room_id uuid, room_index int, pilgrim_id uuid
  ) on commit drop;
  create temp table if not exists _opt (pilgrim_id uuid, reason text) on commit drop;

  for v_night in select * from jsonb_array_elements(p_nights) loop
    v_res := (v_night->>'reservation_id')::uuid;
    select p.name into v_hotel
      from public.reservations r join public.providers p on p.id = r.provider_id
     where r.id = v_res and r.departure_id = p_departure_id;
    if v_hotel is null then
      raise exception 'Una de las reservas no es de este camino';
    end if;

    truncate _asg; truncate _opt;
    insert into _asg
      select (a->>'reservation_room_id')::uuid, (a->>'room_index')::int, (a->>'pilgrim_id')::uuid
      from jsonb_array_elements(coalesce(v_night->'assignments', '[]'::jsonb)) a;
    insert into _opt
      select (o->>'pilgrim_id')::uuid, nullif(o->>'reason', '')
      from jsonb_array_elements(coalesce(v_night->'opt_outs', '[]'::jsonb)) o;

    if exists (
      select 1 from _asg a
      left join public.reservation_rooms rr
        on rr.id = a.reservation_room_id and rr.reservation_id = v_res
      where rr.id is null or a.room_index < 1 or a.room_index > rr.rooms_count
    ) then
      raise exception '%: hay una habitación que ya no existe en esta reserva. Recargá la página y volvé a repartir.', v_hotel;
    end if;
    if exists (select 1 from _asg group by pilgrim_id having count(*) > 1) then
      raise exception '%: un peregrino quedó en dos habitaciones de la misma noche', v_hotel;
    end if;
    if exists (
      select 1 from _asg a join public.reservation_rooms rr on rr.id = a.reservation_room_id
      group by a.reservation_room_id, a.room_index, rr.capacity_per_room
      having count(*) > rr.capacity_per_room
    ) then
      raise exception '%: una habitación tiene más gente que plazas', v_hotel;
    end if;
    select p.full_name into v_nombre
      from _asg a join _opt o on o.pilgrim_id = a.pilgrim_id
      join public.pilgrims p on p.id = a.pilgrim_id
     limit 1;
    if v_nombre is not null then
      raise exception '%: % tiene cama y a la vez está marcado como que no duerme acá', v_hotel, v_nombre;
    end if;
    select p.full_name into v_nombre
      from (select pilgrim_id from _asg union select pilgrim_id from _opt) x
      join public.pilgrims p on p.id = x.pilgrim_id
     where not exists (
       select 1 from public.registrations reg
       where reg.pilgrim_id = x.pilgrim_id and reg.departure_id = p_departure_id
         and reg.status <> 'cancelado'
     )
     limit 1;
    if v_nombre is not null then
      raise exception '%: % ya no está inscrito en este camino', v_hotel, v_nombre;
    end if;

    -- El orden importa por las guardas: primero se vacía todo, después se escribe.
    delete from public.room_assignments where reservation_id = v_res;
    delete from public.reservation_opt_outs where reservation_id = v_res and kind = 'hospedaje';
    insert into public.reservation_opt_outs (reservation_id, pilgrim_id, kind, reason, created_by)
      select v_res, pilgrim_id, 'hospedaje', reason, auth.uid() from _opt;
    insert into public.room_assignments (reservation_id, reservation_room_id, room_index, pilgrim_id)
      select v_res, reservation_room_id, room_index, pilgrim_id from _asg;
    get diagnostics v_n = row_count;
    v_filas := v_filas + v_n;
    v_noches := v_noches + 1;
  end loop;

  return jsonb_build_object('noches', v_noches, 'asignaciones', v_filas);
end;
$$;
revoke all on function public.save_rooming_board(uuid, jsonb) from public;
grant execute on function public.save_rooming_board(uuid, jsonb) to authenticated;
