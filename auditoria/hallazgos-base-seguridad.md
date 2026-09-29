# Auditoría de base de datos y seguridad — elcamino-app

- Proyecto Supabase: `btunvfrxegjwpznlmvjp`
- Fecha: 2026-09-29
- Alcance: advisors de Supabase, RLS y grants, storage, rutas públicas por token, integridad de datos, secretos.
- Modo: solo lectura (SELECT y advisors). No se modificó nada.
- Nota: no se incluyen datos personales; solo ids y conteos.

---

## CRÍTICO

### C1. Las 21 vistas `v_*` son SECURITY DEFINER y `anon` puede leerlas: cualquiera con la anon key (que está en el bundle del navegador) lee pasaportes, teléfonos, saldos y movimientos

**Qué:** todas las vistas de `public` (`v_rooming_list`, `v_pilgrim_balance`, `v_all_movements`, `v_financial_global`, `v_menu_choices`, `v_upcoming_installments`, `v_pending_payments`, …, 21 en total) tienen dueño `postgres`, no tienen `security_invoker=on`, y `anon`/`authenticated` tienen `SELECT` (e incluso INSERT/UPDATE/DELETE) sobre ellas. Como la vista se ejecuta con los permisos del dueño, **se salta el RLS** de las tablas base. La anon key es pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), así que basta un `GET /rest/v1/v_rooming_list?select=*` sin sesión.

**Evidencia:**
- Advisor `security_definer_view` (ERROR) × 21.
- `reloptions` = null en todas; `has_table_privilege('anon', …, 'SELECT')` = true en todas.
- Prueba con el rol anon (solo conteos):
  ```sql
  begin; set local role anon;
  select count(*) from v_rooming_list;      -- 183 filas
  select count(*) from v_pilgrim_balance;   -- 30
  select count(*) from v_all_movements;     -- 10
  select count(*) from v_financial_global;  -- 1
  select count(*) from pilgrims;            -- 0  (la tabla sí está protegida)
  ```
- Columnas expuestas en `v_rooming_list`: `pilgrim_name, sex, pilgrim_phone, dietary_notes, passport_number, nationality`, datos de hotel. `v_pilgrim_balance`: nombre, totales, pagado, pendiente, penalidades. `v_menu_choices`: nombre y notas dietarias (dato de salud).

**Arreglo (migración):**
```sql
-- 1) Que las vistas respeten el RLS de quien consulta
do $$ declare v record; begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='v' loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
    execute format('revoke all on public.%I from anon', v.relname);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', v.relname);
  end loop;
end $$;
```
Antes de aplicar: revisar que las funciones SECURITY DEFINER que leen vistas (p. ej. `save_meal_choices` lee `v_dinner_reservations`) sigan funcionando — sí, porque corren como `postgres`. Las páginas públicas usan el cliente service-role, que salta RLS igual, así que no se rompen.

### C2. `reservation_payment_schedule` es legible y escribible por `anon` (política `true` para `public`)

**Qué:** políticas `"read rps"` (SELECT, `true`) y `"write rps"` (ALL, `true`, `with check true`) con rol `{public}` — incluye `anon`. Sin sesión se puede leer, crear, modificar y borrar el calendario de pagos a proveedores.

**Evidencia:** `pg_policies` → `reservation_payment_schedule | write rps | {public} | ALL | true | true`. Con `set local role anon`: `select count(*) from reservation_payment_schedule` = 7. Advisor `multiple_permissive_policies` también la marca.

**Arreglo:**
```sql
drop policy "read rps" on public.reservation_payment_schedule;
drop policy "write rps" on public.reservation_payment_schedule;
create policy reservation_payment_schedule_team_all on public.reservation_payment_schedule
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
```

### C3. Escalada de privilegios: cualquier usuario registrado puede ponerse `app_role='admin'` en su propio perfil, y el registro abierto está activado

**Qué:**
- `GET /auth/v1/settings` devuelve `disable_signup: false` (correo habilitado, con confirmación). Cualquiera puede crear cuenta con un correo propio.
- La política `profiles_update_self` permite `UPDATE` de la fila propia **sin restringir columnas**, y `authenticated` tiene privilegio `UPDATE` sobre la columna `app_role`.
- `is_team_member()` solo mira `profiles.app_role in ('nico','naty','admin')`.
- Resultado: `supabase.auth.signUp(...)` → confirmar correo → `update profiles set app_role='admin' where id=auth.uid()` → acceso total a todas las tablas y a los buckets `passports`, `payment-proofs`, `receipts`.

**Evidencia:** `pg_policies` → `profiles_update_self | {public} | UPDATE | (auth.uid() = id) | (auth.uid() = id)`; `information_schema.column_privileges` → `authenticated UPDATE app_role`; `auth/v1/settings` → `disable_signup: false`. Hoy hay 1 solo usuario en `auth.users` (admin), así que no hay indicio de explotación.

**Arreglo:**
1. En el dashboard: Authentication → Sign In / Providers → **desactivar "Allow new users to sign up"** (el equipo se invita a mano).
2. Migración:
```sql
revoke update (app_role) on public.profiles from authenticated, anon;
revoke insert on public.profiles from anon, authenticated;  -- el trigger handle_new_user ya crea la fila
drop policy profiles_insert_self on public.profiles;
drop policy profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- defensa en profundidad: un trigger que impida cambiar app_role salvo a service_role/postgres
create or replace function public.profiles_guard_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.app_role is distinct from old.app_role
     and coalesce(current_setting('request.jwt.claim.role', true),'') not in ('service_role')
     and current_user not in ('postgres','service_role') then
    raise exception 'app_role no se puede cambiar desde la app';
  end if;
  return new;
end $$;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.profiles_guard_role();
```

### C4. Contratos, firmantes, OTPs, eventos de contrato, fotos de proveedor y el bucket `contracts` están abiertos a **cualquier** usuario autenticado (no usan `is_team_member()`)

**Qué:** políticas con `using (true) with check (true)` para `authenticated` en `contracts`, `contract_signers` (nombre, documento, correo, teléfono, IP, geo, ruta de la firma), `contract_otps` (hash del código, intentos), `contract_events`, `provider_photos`; y en `storage.objects` las políticas `contracts_bucket_team_all` y `brand_bucket_team_write` solo filtran por `bucket_id`. Combinado con C3 (registro abierto) cualquiera con una cuenta nueva lee y reescribe contratos firmados, borra PDFs del bucket `contracts`, reemplaza el logo del bucket público `brand`, o reinicia OTPs.

**Evidencia:** `pg_policies`:
`contracts_team_all | {authenticated} | ALL | true | true`, `contract_signers_team_all … true`, `contract_otps_team_all … true`, `contract_events_select … true`, `contract_events_insert … with_check true`, `provider_photos_team_all … true`, `contracts_bucket_team_all | (bucket_id = 'contracts')`, `brand_bucket_team_write | (bucket_id = 'brand')`.

**Arreglo:**
```sql
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
```
(La página `/firmar` usa service role, así que no depende de estas políticas.)

> Nota sobre C1: ninguna vista referencia `auth.*`, `storage.*` ni `vault.*` (`pg_views` filtrado), y ninguna es auto-actualizable (`information_schema.views`), así que pasar a `security_invoker` no rompe nada para el equipo y los INSERT/UPDATE de anon sobre vistas no llegan a escribir. No está instalado `pg_graphql`, así que la exposición es solo por PostgREST.

---

## ALTO

### A1. Funciones SECURITY DEFINER sin `search_path` fijo, incluida `is_team_member()` (la base de todo el RLS)

**Qué:** 20 funciones con `search_path` mutable (advisor `function_search_path_mutable`). Las críticas son las SECURITY DEFINER: `is_team_member`, `handle_new_user`, `freeze_departure_trm`, `clear_departure_settlement_trm`, `set_departure_settlement_mode`, `set_registration_settlement_trm` (`proconfig = null`). Una SECURITY DEFINER sin `search_path` se puede secuestrar si alguien logra crear objetos en un esquema que esté antes en el path. El riesgo real hoy es bajo (anon/authenticated no pueden crear en `public`), pero `is_team_member` es la llave de todas las políticas.

**Arreglo:**
```sql
alter function public.is_team_member() set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.freeze_departure_trm(uuid, numeric, date) set search_path = public, pg_temp;
alter function public.clear_departure_settlement_trm(uuid) set search_path = public, pg_temp;
alter function public.set_departure_settlement_mode(uuid, text) set search_path = public, pg_temp;
alter function public.set_registration_settlement_trm(uuid, numeric, date) set search_path = public, pg_temp;
-- y las 14 de trigger/cálculo (touch_updated_at, compute_payment_eur, trm_at_or_before, compute_departure_scenario,
-- recompute_reservation_from_rooms, sync_budget_item_from_reservation, auto_link_orphan_budget_items,
-- unmark_schedule_on_payment_delete, payment_fx_recalc, room_assignment_sync_reservation,
-- reservation_opt_out_guard, meal_choice_sync, menu_course_guard, pilgrim_payment_penalidad_defaults)
-- con el mismo `alter function ... set search_path = public, pg_temp;`
```

### A2. Funciones RPC SECURITY DEFINER ejecutables por `anon`

**Qué:** advisor `anon_security_definer_function_executable` × 9. Revisé el cuerpo de cada una:
- `freeze_departure_trm`, `clear_departure_settlement_trm`, `set_departure_settlement_mode`, `set_registration_settlement_trm`, `save_meal_choices`, `save_rooming_board`: **sí** validan `is_team_member()` al inicio → anon recibe "No autorizado". Correcto, pero sobra exponerlas.
- `prune_dependent_choices(p_reservation_id, p_pilgrim_id)`: **no** valida nada. Anon puede llamarla por `/rest/v1/rpc/prune_dependent_choices` con cualquier reserva. Impacto acotado: solo borra `meal_choices` de secciones condicionales cuyo plato padre no está elegido (filas ya inválidas), pero es una escritura anónima sin control.
- `handle_new_user()`: es de trigger; llamarla por RPC falla. `is_team_member()`: devuelve false a anon. Inofensivas, pero no deberían estar en la API.

**Arreglo:**
```sql
revoke execute on function public.prune_dependent_choices(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prune_dependent_choices(uuid, uuid) to service_role;  -- la usa lib/menus/por-token.ts con service role
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.freeze_departure_trm(uuid, numeric, date),
  public.clear_departure_settlement_trm(uuid), public.set_departure_settlement_mode(uuid, text),
  public.set_registration_settlement_trm(uuid, numeric, date),
  public.save_meal_choices(uuid, jsonb), public.save_rooming_board(uuid, jsonb) from public, anon;
-- is_team_member la necesitan las políticas de authenticated: quitarla solo de anon
revoke execute on function public.is_team_member() from public, anon;
```
Ojo: `save_meal_choices` llama internamente a `prune_dependent_choices`; como corre como `postgres` sigue funcionando.

### A3. `anon` y `authenticated` tienen GRANT total (SELECT/INSERT/UPDATE/DELETE/TRUNCATE…) en las 33 tablas; solo el RLS los frena

**Qué:** `has_table_privilege('anon', …)` = true para todo en todas las tablas y vistas. Es el default de Supabase, pero significa que un solo error de política (como C2) o una vista definer (C1) abre la tabla completa. Ninguna tabla necesita acceso de anon: todas las páginas públicas usan el cliente service-role.

**Arreglo (defensa en profundidad):**
```sql
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
```

### A4. Dos peregrinos distintos, en el mismo camino, con el mismo número de pasaporte

**Qué:** `pilgrims` `3ea14afc-d747-4643-8f8d-113f00192c91` y `63200d38-fc0f-4416-8f7d-84e425a8d80c`: nombre, correo distintos; ambos inscritos en `39fc6fa6-…` (Camino Francés — Abril 2027); mismo `passport_number` (9 caracteres). Ninguno tiene foto de pasaporte cargada. Uno de los dos está mal digitado; ese dato va a la rooming list de hoteles y al seguro.

**Evidencia:**
```sql
select string_agg(id::text, ',') from pilgrims where deleted_at is null and coalesce(passport_number,'')<>''
group by upper(regexp_replace(passport_number,'[^A-Za-z0-9]','','g')) having count(*)>1;
```

**Arreglo:** corregir a mano (pedir foto del pasaporte a los dos) y luego:
```sql
create unique index pilgrims_passport_unique on public.pilgrims (upper(regexp_replace(passport_number,'[^A-Za-z0-9]','','g')))
  where deleted_at is null and passport_number is not null and passport_number <> '';
```

---

## MEDIO

### M1. Contraseñas filtradas: protección desactivada
Advisor `auth_leaked_password_protection`. Activar en Authentication → Providers → Email → "Leaked password protection". Con registro abierto (C3) importa más.

### M2. Enlace del camino (grupo) en `/registro` y `/menu/c`: cualquier miembro del grupo actúa por otro
**Qué (diseño consciente, pero con riesgo):**
- `/menu/c/<token>` lista **todos los nombres** del camino (`listaPorTokenDeCamino`, lib/menus/por-token.ts:177) y deja elegir/borrar platos o marcar "no cena" por cualquiera de ellos (`guardarEleccionPorAcceso`, `marcarNoCenaPorAcceso`). Si el enlace se reenvía fuera del grupo, un tercero ve la lista y cambia menús.
- `/registro/<token del camino>`: quien escriba el nombre y apellido de otro que aún no ha llenado ni tiene enlace personal puede escribir **su ficha completa** (correo, teléfono, pasaporte, contacto de emergencia) y subir una "foto de pasaporte" a su carpeta (lib/registro/por-token.ts:221 y 313). `bloqueadoPorGrupo` protege a quien ya envió o ya tiene enlace personal. Hoy `departures.registration_token` está vacío en los 3 caminos (0 tokens), así que no está en uso.
- `buscarPorNombre` responde distinto a "ninguno/varios/personal": permite confirmar si una persona está inscrita (enumeración), sin límite de intentos.

**Arreglo:** preferir siempre los enlaces personales (ya existen `form_token` y `menu_token`); si el de grupo se mantiene, rotarlo (`menu_token`, `registration_token`) al cerrar la elección, añadir expiración (`*_token_created_at + interval '14 days'`) y un límite de intentos por IP en `accionBuscarNombre`.

### M3. Estado de las cuotas en la tabla no se mantiene: `payment_plan_installments.status` dice 35 "pendiente" vencidas, la vista dice 37 pagadas y 5 vencidas
**Evidencia:**
```sql
select count(*) from payment_plan_installments where status='pendiente' and due_date<current_date; -- 35
select status, count(*), sum(remaining_eur) from v_installment_status where due_date<current_date group by 1;
-- vencida 5 (1.259 €), pagada 37
select count(*) from payment_plan_installments where status='pagada' and paid_payment_id is null; -- 7
```
El estado real se calcula en `v_installment_status`; la columna `status` y `paid_payment_id` solo se tocan con `markInstallmentPaid` (lib/actions/payment-plans.ts:33). Cualquier consulta o export que lea la tabla directo muestra deudas falsas.
**Arreglo:** leer siempre `v_installment_status`, o eliminar la columna / convertirla en generada; como mínimo documentarla como "manual" y no usarla en reportes.

### M4. Cuotas que no suman el precio acordado
Inscripción `b481b5c3-f6c5-4120-9bbb-7b53cdeaed32`: neto 2.529 €, cuotas suman 2.535 € (3 cuotas). Corregir el plan. El generador de contratos ya avisa (lib/contracts/datos.ts:174), pero no hay control en la base.

### M5. `registrations.departure_id` y `pilgrim_payments.registration_id` son ON DELETE CASCADE
Borrar un camino (desde el dashboard de Supabase o por SQL) borra en cascada inscripciones → abonos → cuotas, sin rastro. `contracts.registration_id` es RESTRICT y hoy frena el borrado si hay contratos, pero los caminos sin contratos caen enteros. La app no tiene acción para borrar caminos, así que el riesgo es operativo.
**Arreglo:**
```sql
alter table public.pilgrim_payments drop constraint pilgrim_payments_registration_id_fkey,
  add constraint pilgrim_payments_registration_id_fkey foreign key (registration_id) references public.registrations(id) on delete restrict;
alter table public.registrations drop constraint registrations_departure_id_fkey,
  add constraint registrations_departure_id_fkey foreign key (departure_id) references public.departures(id) on delete restrict;
```

### M6. Fechas de caminos inconsistentes y sin CHECK
- `530955f7-aa49-4012-9112-09bb5e1e6e1e` "Camino Portugues - Septiembre 2027": `start_date = 2026-10-22`, `end_date = null`, ruta de 11 días, capacidad null. El nombre dice 2027 y la fecha es de 2026 (conocido).
- `39fc6fa6-…` "Camino Francés — Abril 2027": 24→30 abr (6 días) con ruta de 8 días (`routes.days = 8`); las reservas van del 23 al 30. Revisar si la ruta asignada es la correcta.
- `9c1a3bf2-…` "Camino Francés — Septiembre 2026": empezó el 2026-09-28 y sigue en `status = 'open'` (debería ser `in_progress`).
**Arreglo:**
```sql
alter table public.departures add constraint departures_fechas_chk check (end_date is null or end_date >= start_date);
alter table public.departures add constraint departures_contrato_fechas_chk check (contract_end_date is null or contract_start_date is null or contract_end_date >= contract_start_date);
```

---

## BAJO

### B1. 16 FK sin índice (advisor `unindexed_foreign_keys`)
`budget_items.provider_id`, `contract_events.signer_id`, `contracts.created_by`, `contracts.parent_contract_id`, `departures.route_id`, `expenses.created_by`, `meal_choices.course_id`, `meal_choices.option_id`, `payment_plan_installments.paid_payment_id`, `provider_payments.payment_account_id`, `provider_payments.reservation_id`, `registration_requests.pilgrim_id`, `reservation_opt_outs.created_by`, `reservation_payment_schedule.provider_payment_id`, `reservations.payment_account_id`, `trm_rates.set_by`. Con el volumen actual (decenas de filas) no se nota; importan para los `ON DELETE CASCADE/SET NULL`.
```sql
create index on public.provider_payments (reservation_id);
create index on public.meal_choices (course_id);
create index on public.meal_choices (option_id);
create index on public.payment_plan_installments (paid_payment_id);
create index on public.reservation_payment_schedule (provider_payment_id);
create index on public.reservations (payment_account_id);
create index on public.provider_payments (payment_account_id);
create index on public.budget_items (provider_id);
create index on public.contract_events (signer_id);
create index on public.contracts (parent_contract_id);
create index on public.departures (route_id);
create index on public.registration_requests (pilgrim_id);
```
Además, 14 índices nunca usados (advisor `unused_index`) — no borrarlos todavía: la base es joven.

### B2. Políticas de `profiles` re-evalúan `auth.uid()` por fila (advisor `auth_rls_initplan` × 3) y `reservation_payment_schedule` tiene dos políticas permisivas (se resuelve con C2). Arreglo incluido en C3 (`(select auth.uid())`).

### B3. `departures.travel_doc_token` sin UNIQUE ni índice, y de 192 bits (48 hex)
Los demás tokens públicos son 256 bits y únicos. 192 bits sigue siendo inadivinable; lo que falta es la unicidad.
```sql
create unique index departures_travel_doc_token_key on public.departures (travel_doc_token) where travel_doc_token is not null;
alter table public.registrations add constraint registrations_form_token_chk check (form_token is null or form_token ~ '^[0-9a-f]{64}$');
alter table public.registrations add constraint registrations_menu_token_chk check (menu_token is null or menu_token ~ '^[0-9a-f]{64}$');
alter table public.contracts add constraint contracts_access_token_chk check (access_token is null or access_token ~ '^[0-9a-f]{64}$');
```

### B4. Enlaces de "versión web" del correo apuntan a `/correo/<token>`, pero la ruta no existe
`lib/actions/contracts.ts:226` arma `${baseUrl()}/correo/${tokenWeb}`; `/correo` está en `PUBLICAS` (middleware.ts) y en `next.config.mjs`, pero no hay `app/correo/**`. El enlace da 404. No es un hueco de seguridad (el HTML queda en `email_log.html`, protegido por RLS de equipo), pero si se implementa la página debe filtrar por `email_log.token` + `expires_at` + `revoked_at is null`.

### B5. `/verificar/<hash>` muestra nombre completo y número de documento de los firmantes
app/verificar/[hash]/page.tsx:25-31 y 60-66. Quien tiene el hash ya tiene el PDF, pero la página es pública e indexable por quien obtenga el hash. Sugerencia: enmascarar el documento (`•••• 1234`).

### B6. Ruta de pasaporte validada solo con `startsWith`
`leerPasaporte` (lib/registro/por-token.ts:255) acepta cualquier `path` que empiece por `<pilgrim_id>/`. Endurecer con `/^[0-9a-f-]{36}\/\d{13}\.[a-z0-9]{1,5}$/` para descartar `..` u otras rutas.

### B7. OTP de firma: el contador de intentos no es atómico
lib/contracts/sign.ts:240-255 lee `attempts` y luego hace `update attempts = attempts + 1` desde JS. Peticiones en paralelo pueden probar más de 5 códigos. Con 8 OTP/hora y 10⁶ combinaciones el riesgo es muy bajo. Arreglo: `update contract_otps set attempts = attempts + 1 where id = … and attempts < 5 returning attempts` antes de comparar.

### B8. Datos libres sin normalizar (texto tipo enum)
- `pilgrims.country`: "México", "MEXICO", "MEX", "COL", "Colombia", "COLOMBIA", "REPÚBLICA DE COLOMBIA".
- `pilgrim_payments.method`: mezcla método y banco ("Bancolombia" = 42, "Transferencia" = 14). `account` y `provider_payments.account/method`, `reservations.pay_from_account`, `expenses.account` son texto libre sin CHECK.
- `reservations.accommodation_type` = NULL en las 31 filas (columna muerta).
- `pilgrims.sex` NULL en 3; `nationality` NULL en 12.
Sugerencia: CHECK o tabla de catálogo para `account`/`method`, y normalizar `country` a ISO-3166.

### B9. Vista previa de `/video/<token>` incluye el nombre del peregrino en el título OG
app/video/[token]/page.tsx:19. Si el enlace se reenvía, la vista previa de WhatsApp muestra el nombre. Menor.

### B10. Sin límite de peticiones en las acciones públicas
`accionSolicitar` (inserta en `registration_requests`), `accionBuscarNombre`, `/video/<token>/visto` (incrementa `view_count` sin límite, y con lectura-luego-escritura no atómica). Solo el OTP tiene freno. Añadir rate limit por IP (p. ej. tabla + ventana o middleware).

---

## Verificado correcto

**RLS y storage**
- Las 33 tablas de `public` tienen RLS activado y al menos una política. Las políticas de negocio (pilgrims, registrations, pilgrim_payments, reservations, providers, expenses, budget_items, menús, rooming, videos, etc.) usan `is_team_member()` para `authenticated`. Las excepciones son C2 y C4.
- Con `set local role anon`, `select count(*) from pilgrims` = 0: las tablas base sí están cerradas para anon (el hueco son las vistas, C1).
- Buckets: `passports`, `contracts`, `receipts` y `payment-proofs` son **privados** (`public = false`); solo `brand` es público. `passports` tiene lista de MIME y límite de 50 MB; su política exige `is_team_member()`. Ningún objeto de `passports` queda huérfano y toda `passport_image_path` apunta a un objeto existente.
- Hoy existe 1 solo usuario en `auth.users` (rol admin), 0 anónimos, 0 sin rol de equipo.

**Rutas públicas por token**
- Todas las rutas de `PUBLICAS` (`/carta`, `/video`, `/firmar`, `/verificar`, `/viaje`, `/menu`, `/menu/c`, `/registro`, `/api/pdf/contrato/publico`, `/api/pdf/viaje`, `/api/pdf/bienvenida/publico`) validan la forma del token (`/^[0-9a-f]{64}$/`, o `{48}` en viaje) **antes** de consultar, y cada consulta service-role filtra por ese token (`.eq("form_token"| "menu_token" | "access_token" | "token" | "travel_doc_token", token)`).
- Los ids que manda el navegador nunca se creen: `registrationId` se cruza con el camino del token (`acceso`, `inscripcionPorTokenDeCamino`), `reservationId` con `v_dinner_reservations` del camino (`cenaDelCamino`), `courseId` con la reserva y `optionId` con el curso; `pilgrim_id` sale siempre del token. Con el enlace personal no se puede escribir en la ficha de otra persona.
- El registro por enlace de grupo no puede pisar a quien ya envió el formulario o ya tiene enlace personal (`bloqueadoPorGrupo`), y por el grupo no se devuelve nada de la persona (ni correo ni si subió pasaporte).
- Firma: token de 256 bits (`crypto.randomBytes(32)`), vence a los 21 días, OTP de 6 dígitos hasheado con sal por firmante, comparación en tiempo constante (`timingSafeEqual`), 5 intentos por código y 8 códigos por hora; IP y user-agent se leen en el servidor. El PDF se sirve desde el servidor con `no-store`, nunca una URL de Storage.
- Tokens en la base: todos con la forma esperada y sin duplicados (`form_token` 3, `contracts.access_token` 11, `pilgrim_videos.token` 13 con CHECK y UNIQUE, `departures.menu_token` 1, `travel_doc_token` 1). Ningún `form_token` coincide con un `registration_token`.
- Fuga por Referer / indexación: `next.config.mjs` pone `Referrer-Policy: no-referrer` y `X-Robots-Tag: noindex, nofollow` en todas las rutas por token; las páginas también declaran `robots: noindex`. Los metadatos OG de `/registro` y `/carta` solo llevan el nombre del camino.
- No hay `console.log/error` en las rutas públicas ni en los módulos `por-token` (no se escriben tokens en logs).
- Los tokens se buscan con `.eq()` contra un índice único, no con `===` en JS; no hay fuga útil por tiempo.

**Integridad de datos (todas en 0)**
- Inscripciones o pagos de peregrinos borrados (soft delete): 0. Peregrinos vivos sin inscripción: 0.
- Pagos duplicados (misma inscripción, fecha, monto, moneda, tipo): 0. Pagos a proveedor duplicados: 0. Gastos duplicados: 0.
- Pagos, pagos a proveedores y gastos con fecha futura: 0. `amount_eur` nulo: 0. COP sin TRM: 0. Montos ≤ 0 en proveedores y gastos: 0.
- Signo de los abonos: `pilgrim_payments_amount_signo_check` obliga negativo en `devolucion`/`penalidad` y positivo en el resto (la penalidad negativa es intencional). El único pago sin método ni cuenta (`3b848388-…`) es una penalidad, lo que es correcto.
- `total_eur` nulo o 0 en inscripciones no canceladas de peregrinos (no equipo): 0 (los 4 en 0 son del equipo). Descuento mayor que el total: 0.
- Reservas con `check_out < check_in`: 0; fuera de las fechas del camino: 0. Pagos a proveedor con camino o proveedor distinto al de su reserva: 0. Presupuesto con camino distinto al de su reserva: 0.
- Rooming y menús: asignaciones, elecciones y "no cena" de personas no inscritas o canceladas: 0; habitaciones con sobrecupo o índice fuera de rango: 0; elecciones con curso u opción de otra reserva: 0.
- Contratos firmados sin PDF sellado o sin hash: 0. Contratos vivos de inscripciones canceladas: 0.
- Correo, documento, teléfono y nombre duplicados entre peregrinos: 0 (solo el pasaporte, A4).
- Columnas tipo enum con CHECK (`registrations.status`, `reservations.status`, `pilgrim_payments.kind/currency`, `contracts.status`, etc.): todos los valores están dentro del dominio.

**Secretos**
- `.gitignore` excluye `.env` y `.env.*` (solo `.env.example` versionado, con valores vacíos o de ejemplo); en el historial de git no hay `.env*` ni JWT de Supabase.
- Búsqueda de patrones de llaves (JWT `eyJ…`, `sk-ant-`, `xkeysib-`, `sb_secret_`, `sbp_`, `AIza`, `ghp_`, contraseñas literales) en el repo sin `node_modules`/`.next`: 0 coincidencias.
- `SUPABASE_SERVICE_ROLE_KEY` solo se lee en `lib/supabase/admin.ts`, que importa `server-only`; los módulos que usan `createAdminClient` son todos de servidor (rutas API, páginas server, `lib/**/por-token.ts`, `lib/contracts/*`, `lib/email/send.ts`). Los scripts de `scripts/` la leen de `process.env`, no la tienen escrita.
- El secreto de n8n (`N8N_GMAIL_SECRET`) y las llaves S3 de videos se leen de variables de entorno.

---

## Resumen

| Severidad | Cantidad | Hallazgos |
|---|---|---|
| CRÍTICO | 4 | C1 vistas definer legibles por anon (pasaportes, saldos) · C2 `reservation_payment_schedule` abierta a anon · C3 registro abierto + auto-promoción a admin · C4 contratos/OTP/bucket contracts abiertos a cualquier autenticado |
| ALTO | 4 | A1 search_path mutable · A2 RPC definer ejecutables por anon (`prune_dependent_choices` sin control) · A3 GRANT total a anon · A4 pasaporte duplicado entre dos personas |
| MEDIO | 6 | M1 leaked password · M2 enlaces de grupo · M3 estado de cuotas desactualizado · M4 cuotas ≠ precio · M5 CASCADE que borra pagos · M6 fechas de caminos |
| BAJO | 10 | B1 índices FK · B2 initplan · B3 unicidad travel_doc_token · B4 `/correo` 404 · B5 documento en /verificar · B6 path pasaporte · B7 OTP no atómico · B8 texto libre · B9 nombre en OG de video · B10 sin rate limit |

**Orden sugerido:** C3 (desactivar registro en el dashboard, 1 clic) → C1 + C2 + C4 en una sola migración → A2/A3 → A1 → A4 (corregir el dato) → resto.
