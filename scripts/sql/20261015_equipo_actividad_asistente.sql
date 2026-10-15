-- Cuentas por persona, bitácora de actividad y asistente (2026-10-15). Copia de referencia;
-- aplicada en producción con apply_migration.
--
-- Hasta hoy Naty y Nico entraban con UNA cuenta compartida (elcaminoconnaty@gmail.com), así
-- que no había forma de saber quién registró un pago o quién borró una reserva. Desde acá:
--   1. Cada uno tiene su cuenta y entra con su cédula.
--   2. Todo lo que se escribe en las tablas del negocio queda en `audit_log` con su autor.
--   3. Lo que se le pregunta al asistente queda en `assistant_messages`, también con autor.

-- 1. Cédula como usuario ------------------------------------------------------------------
-- Supabase Auth necesita un correo, así que la cuenta usa uno sintético
-- (<cedula>@equipo.elcaminoconnaty.com, dominio sin buzón). La persona solo ve su cédula.
-- `password_set_at` nulo = la cuenta todavía no tiene contraseña propia: la primera vez que
-- entra con su cédula, la crea. "Restablecer" la vuelve a poner en nulo.
alter table public.profiles add column if not exists cedula text;
alter table public.profiles add column if not exists password_set_at timestamptz;
alter table public.profiles drop constraint if exists profiles_cedula_formato;
alter table public.profiles add constraint profiles_cedula_formato check (cedula ~ '^[0-9]{5,12}$');
create unique index if not exists profiles_cedula_key on public.profiles (cedula);
-- Nadie se cambia el rol, la cédula ni la marca de contraseña desde la app: lo hace el
-- servidor con la llave de servicio. (Un REVOKE por columna no sirve cuando el rol tiene
-- UPDATE sobre la tabla entera; el candado de verdad es este trigger.)
create or replace function public.profiles_guard_role() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.app_role is distinct from old.app_role
      or new.cedula is distinct from old.cedula
      or new.password_set_at is distinct from old.password_set_at)
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') <> 'service_role'
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'El rol, la cédula y la contraseña no se cambian desde la aplicación';
  end if;
  return new;
end $$;

-- 2. Bitácora de actividad ----------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,                -- null = no fue una persona del equipo (enlace público, sistema)
  user_name text,              -- copia del nombre en ese momento, por si el perfil cambia
  actor text not null,         -- 'equipo' | 'sistema'
  table_name text not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  row_id text,
  changed text[],              -- en un update, qué columnas cambiaron
  old jsonb,                   -- update: solo las columnas que cambiaron; delete: la fila
  new jsonb                    -- insert: la fila; update: solo las columnas que cambiaron
);
comment on table public.audit_log is
  'Quién escribió qué. Append-only: la llena un trigger SECURITY DEFINER y nadie puede editarla ni borrarla desde la app.';
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_user_idx on public.audit_log (user_id, at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_team_select on public.audit_log;
create policy audit_log_team_select on public.audit_log for select to authenticated
  using (public.is_team_member());
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
revoke all on public.audit_log from anon;

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- Lo que no se copia: secretos de los enlaces y blobs grandes que no dicen quién hizo qué.
  omitir constant text[] := array[
    'access_token', 'menu_token', 'form_token', 'travel_doc_token', 'registration_token', 'token',
    'code_hash', 'passport_mrz', 'passport_ocr', 'registration_form_raw', 'html', 'snapshot',
    'travel_doc', 'welcome_letter', 'payload', 'updated_at'
  ];
  v_old jsonb; v_new jsonb; v_changed text[]; v_uid uuid := auth.uid(); v_name text; k text;
  v_row_id text; o jsonb := '{}'; n jsonb := '{}';
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old) - omitir; end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new) - omitir; end if;
  -- Antes del diff: en un update el id casi nunca cambia y el diff lo descartaría.
  v_row_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key', v_new ->> 'date', v_old ->> 'date');

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if (v_old -> k) is distinct from (v_new -> k) then
        v_changed := array_append(v_changed, k);
        o := o || jsonb_build_object(k, v_old -> k);
        n := n || jsonb_build_object(k, v_new -> k);
      end if;
    end loop;
    if v_changed is null then return null; end if;  -- solo cambió updated_at o un secreto
    v_old := o; v_new := n;
  end if;

  if v_uid is not null then
    select coalesce(full_name, email) into v_name from public.profiles where id = v_uid;
  end if;

  insert into public.audit_log (user_id, user_name, actor, table_name, op, row_id, changed, old, new)
  values (
    v_uid, v_name, case when v_uid is null then 'sistema' else 'equipo' end,
    tg_table_name, lower(tg_op), v_row_id, v_changed, v_old, v_new
  );
  return null;
end $$;
revoke execute on function public.audit_row_change() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array[
    'app_settings', 'budget_items', 'contracts', 'departures', 'expenses', 'meal_choices',
    'payment_plan_installments', 'pilgrim_payments', 'pilgrim_videos', 'pilgrims', 'profiles',
    'provider_payment_accounts', 'provider_payments', 'provider_photos', 'providers',
    'registration_requests', 'registrations', 'reservation_menu_courses', 'reservation_menu_options',
    'reservation_opt_outs', 'reservation_payment_schedule', 'reservation_rooms', 'reservations',
    'room_assignments', 'route_stages', 'route_template_items', 'routes', 'trm_rates'
  ] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format(
      'create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- 3. Asistente ----------------------------------------------------------------------------
create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_conversations_user_idx on public.assistant_conversations (user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tools jsonb,                 -- consultas que hizo el asistente para responder
  error text,
  model text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_conv_idx on public.assistant_messages (conversation_id, created_at);
create index if not exists assistant_messages_user_idx on public.assistant_messages (user_id, created_at desc);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
-- El equipo ve todas las conversaciones (para saber quién preguntó qué); cada quien escribe
-- solo a su nombre. Sin DELETE: el registro de preguntas no se borra desde la app.
drop policy if exists assistant_conversations_select on public.assistant_conversations;
create policy assistant_conversations_select on public.assistant_conversations for select to authenticated
  using (public.is_team_member());
drop policy if exists assistant_conversations_insert on public.assistant_conversations;
create policy assistant_conversations_insert on public.assistant_conversations for insert to authenticated
  with check (public.is_team_member() and user_id = (select auth.uid()));
drop policy if exists assistant_conversations_update on public.assistant_conversations;
create policy assistant_conversations_update on public.assistant_conversations for update to authenticated
  using (public.is_team_member() and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists assistant_messages_select on public.assistant_messages;
create policy assistant_messages_select on public.assistant_messages for select to authenticated
  using (public.is_team_member());
drop policy if exists assistant_messages_insert on public.assistant_messages;
create policy assistant_messages_insert on public.assistant_messages for insert to authenticated
  with check (public.is_team_member() and user_id = (select auth.uid()));
revoke all on public.assistant_conversations, public.assistant_messages from anon;
revoke delete, truncate on public.assistant_conversations, public.assistant_messages from authenticated;

-- 4. Consulta de solo lectura para el asistente -------------------------------------------
-- El asistente arma su propio SELECT. Tres candados:
--   a) SECURITY INVOKER: corre como la persona que pregunta, con su RLS.
--   b) Exige transacción de solo lectura. La app la llama por GET, y PostgREST corre los GET
--      en READ ONLY: ni un INSERT ni una función que escriba pueden pasar, aunque el SELECT
--      llame a un RPC. (STABLE solo no alcanza: una función volátil llamada desde adentro
--      sí podría escribir.)
--   c) Una sola sentencia que empiece por SELECT o WITH, y máximo 200 filas.
create or replace function public.asistente_consulta(q text) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare s text; r jsonb;
begin
  if not public.is_team_member() then raise exception 'No autorizado'; end if;
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'asistente_consulta solo corre en una transacción de solo lectura';
  end if;
  s := regexp_replace(btrim(coalesce(q, '')), ';\s*$', '');
  if s !~* '^(select|with)\s' then raise exception 'Solo se permiten consultas SELECT'; end if;
  if position(';' in s) > 0 then raise exception 'Una sola consulta, sin punto y coma en el medio'; end if;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) _q limit 200) t', s)
    into r;
  return r;
end $$;
revoke execute on function public.asistente_consulta(text) from public, anon;
grant execute on function public.asistente_consulta(text) to authenticated;
