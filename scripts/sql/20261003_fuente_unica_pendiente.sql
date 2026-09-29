-- ============================================================================
-- Fuente única / robustez — SQL PENDIENTE (NO APLICADO)
--
-- Sale de auditoria/hallazgos-fuente-unica.md. El código ya quedó lo más seguro posible
-- sin esto (ver auditoria/arreglos-robustez.md); esto es la defensa en la base.
-- Revisar y aplicar a mano, en este orden, después de probar en una rama.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- C2. La plata nunca se borra en cascada.
-- Hoy borrar una inscripción arrastra sus abonos (ON DELETE CASCADE). Con RESTRICT, un
-- borrado que no pasó por la decisión explícita "reembolsado" falla en vez de perder plata.
-- (deletePilgrim ya borra los abonos antes que la inscripción en el camino "reembolsado",
-- así que sigue funcionando.)
-- ----------------------------------------------------------------------------
alter table public.pilgrim_payments
  drop constraint if exists pilgrim_payments_registration_id_fkey,
  add constraint pilgrim_payments_registration_id_fkey
    foreign key (registration_id) references public.registrations(id) on delete restrict;


-- ----------------------------------------------------------------------------
-- C2. Eliminar peregrino en UNA transacción.
-- Hoy son 5-6 llamadas sueltas desde lib/actions/pilgrims.ts:deletePilgrim; si falla una
-- intermedia queda a medias. Esta función hace lo mismo (misma regla) de una vez.
-- Uso desde TS cuando esté aplicada:
--   const { error } = await supabase.rpc("eliminar_peregrino", { p_pilgrim_id: id, p_modo: mode ?? null });
-- El borrado del archivo del pasaporte en Storage se sigue haciendo desde TS (antes de llamar).
-- ----------------------------------------------------------------------------
create or replace function public.eliminar_peregrino(p_pilgrim_id uuid, p_modo text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_regs uuid[];
  v_con_abonos uuid[];
  v_borrar uuid[];
begin
  if p_modo is not null and p_modo not in ('sin_reembolso', 'reembolsado') then
    raise exception 'Modo inválido: %', p_modo;
  end if;

  -- Bloquea al peregrino y sus inscripciones mientras se decide.
  perform 1 from pilgrims where id = p_pilgrim_id for update;
  select coalesce(array_agg(id), '{}') into v_regs
    from registrations where pilgrim_id = p_pilgrim_id for update;

  select coalesce(array_agg(distinct registration_id), '{}') into v_con_abonos
    from pilgrim_payments
   where registration_id = any(v_regs) and kind <> 'penalidad';

  if cardinality(v_con_abonos) > 0 and p_modo is null then
    raise exception 'El peregrino tiene abonos: decidí si quedan como ingreso o si se reembolsaron.';
  end if;

  if p_modo = 'reembolsado' then
    v_borrar := v_regs;
  else
    select coalesce(array_agg(r), '{}') into v_borrar
      from unnest(v_regs) r where not (r = any(v_con_abonos));
  end if;

  if exists (select 1 from contracts where registration_id = any(v_borrar)) then
    raise exception 'El peregrino tiene un contrato emitido: no se puede borrar del todo. Retíralo del camino en vez de eliminarlo.';
  end if;

  delete from payment_plan_installments where registration_id = any(v_regs);

  if cardinality(v_con_abonos) > 0 and p_modo = 'sin_reembolso' then
    update registrations set status = 'cancelado', refund_status = 'sin_reembolso'
     where id = any(v_con_abonos);
    delete from pilgrim_payments where registration_id = any(v_borrar); -- solo penalidades
    delete from registrations where id = any(v_borrar);
    update pilgrims
       set deleted_at = now(), passport_image_path = null, passport_extracted_at = null
     where id = p_pilgrim_id;
  else
    delete from pilgrim_payments where registration_id = any(v_regs);
    delete from registrations where id = any(v_regs);
    delete from pilgrims where id = p_pilgrim_id;
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- C1. Defensa en la base contra el doble envío (la UI ya deshabilita el botón).
-- Una llave de idempotencia generada al abrir el diálogo; el insert usa
-- `on conflict (idempotency_key) do nothing`. Requiere que los diálogos manden la llave
-- (pendiente en el código: hoy no la mandan).
-- ----------------------------------------------------------------------------
alter table public.pilgrim_payments  add column if not exists idempotency_key uuid;
alter table public.provider_payments add column if not exists idempotency_key uuid;
alter table public.expenses          add column if not exists idempotency_key uuid;
create unique index if not exists pilgrim_payments_idempotency_key_uq  on public.pilgrim_payments  (idempotency_key) where idempotency_key is not null;
create unique index if not exists provider_payments_idempotency_key_uq on public.provider_payments (idempotency_key) where idempotency_key is not null;
create unique index if not exists expenses_idempotency_key_uq          on public.expenses          (idempotency_key) where idempotency_key is not null;
