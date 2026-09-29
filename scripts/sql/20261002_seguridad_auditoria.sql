-- Auditoría de seguridad (2026-09-29). Aplicada en producción con apply_migration. Copia de referencia.
-- Ver auditoria/hallazgos-base-seguridad.md.
--
-- 1. Cuentas nuevas: nacían con app_role = 'nico' (equipo completo) y el registro estaba abierto:
--    cualquiera que se creara una cuenta veía todo. Ahora nacen sin rol, nadie puede cambiarse el
--    rol desde la app y is_team_member() solo es verdad con rol asignado por el administrador.
alter table public.profiles alter column app_role drop not null;
alter table public.profiles alter column app_role drop default;
revoke insert on public.profiles from anon, authenticated;
revoke update (app_role) on public.profiles from anon, authenticated;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create or replace function public.profiles_guard_role() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.app_role is distinct from old.app_role
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') <> 'service_role'
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'El rol no se puede cambiar desde la aplicación';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.profiles_guard_role();

-- 2. Las 21 vistas corrían como su dueño y se saltaban el RLS: con la llave pública (que va en el
--    navegador) se leían pasaportes, teléfonos y saldos sin iniciar sesión.
do $$ declare v record; begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'v' loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
    execute format('revoke all on public.%I from anon', v.relname);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', v.relname);
  end loop;
end $$;

-- 3. Calendario de pagos a proveedores abierto a todo el mundo (política "true" para public).
drop policy if exists "read rps" on public.reservation_payment_schedule;
drop policy if exists "write rps" on public.reservation_payment_schedule;
create policy reservation_payment_schedule_team_all on public.reservation_payment_schedule
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- 4. Contratos, firmantes, códigos, eventos, fotos de proveedor y buckets contracts/brand: solo equipo.
alter policy contracts_team_all on public.contracts using (public.is_team_member()) with check (public.is_team_member());
alter policy contract_signers_team_all on public.contract_signers using (public.is_team_member()) with check (public.is_team_member());
alter policy contract_otps_team_all on public.contract_otps using (public.is_team_member()) with check (public.is_team_member());
alter policy contract_events_select on public.contract_events using (public.is_team_member());
alter policy contract_events_insert on public.contract_events with check (public.is_team_member());
alter policy provider_photos_team_all on public.provider_photos using (public.is_team_member()) with check (public.is_team_member());
alter policy contracts_bucket_team_all on storage.objects
  using (bucket_id = 'contracts' and public.is_team_member())
  with check (bucket_id = 'contracts' and public.is_team_member());
alter policy brand_bucket_team_write on storage.objects
  using (bucket_id = 'brand' and public.is_team_member())
  with check (bucket_id = 'brand' and public.is_team_member());

-- 5. search_path fijo en todas las funciones de public (las SECURITY DEFINER son la llave del RLS).
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;

-- 6. Funciones RPC: nada para anon. prune_dependent_choices no valida quién llama: solo service_role.
revoke execute on function public.prune_dependent_choices(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prune_dependent_choices(uuid, uuid) to service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.freeze_departure_trm(uuid, numeric, date),
  public.clear_departure_settlement_trm(uuid), public.set_departure_settlement_mode(uuid, text),
  public.set_registration_settlement_trm(uuid, numeric, date),
  public.save_meal_choices(uuid, jsonb), public.save_rooming_board(uuid, jsonb) from public, anon;
revoke execute on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated, service_role;

-- 7. Defensa en profundidad: anon no necesita ninguna tabla (las páginas públicas usan service role).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
