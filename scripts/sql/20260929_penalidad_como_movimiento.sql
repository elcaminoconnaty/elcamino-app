-- La penalidad deja de sumarse al precio y pasa a ser un movimiento negativo
-- (2026-09-29).
--
-- Antes: `registrations.penalty_eur` se sumaba al total acordado, así que en el
-- recibo el peregrino veía un precio más alto que el que se le cotizó y, encima,
-- un renglón de penalidad. Ahora la penalidad es un movimiento más en su lista
-- de pagos, con monto en negativo y su propio concepto ("Penalidad por cambio de
-- grupo"): el precio del viaje se queda como estaba y la penalidad se le resta a
-- sus propios abonos. El saldo final da exactamente lo mismo; lo que cambia es
-- cómo se lee.
--
-- Una penalidad NO es plata que entró: no se re-valora con la tasa de cierre
-- (los euros quedan fijados el día que se pactó) y no entra en la caja ni en los
-- saldos por cuenta. Para el negocio el ingreso esperado sigue siendo precio +
-- penalidad, así que las vistas financieras la vuelven a sumar del lado del
-- ingreso.
--
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.

-- ── 1. El movimiento ────────────────────────────────────────────────────────

alter table public.pilgrim_payments
  add column if not exists concept text;

comment on column public.pilgrim_payments.concept is
  'Concepto del movimiento cuando no es un abono corriente (p. ej. "Penalidad por cambio de grupo"). Se muestra en la lista de pagos y en los recibos.';

alter table public.pilgrim_payments drop constraint if exists pilgrim_payments_kind_check;
alter table public.pilgrim_payments add constraint pilgrim_payments_kind_check
  check (kind = any (array['abono'::text, 'cierre'::text, 'devolucion'::text, 'penalidad'::text]));

-- Devoluciones y penalidades viven en negativo; todo lo demás, en positivo.
alter table public.pilgrim_payments drop constraint if exists pilgrim_payments_amount_signo_check;
alter table public.pilgrim_payments add constraint pilgrim_payments_amount_signo_check
  check (case when kind in ('devolucion', 'penalidad') then amount < 0 else amount > 0 end);

-- Una penalidad no es caja: no tiene cuenta ni medio de pago, y sus euros quedan
-- fijados el día que se pactó (no se re-valoran a la tasa de cierre).
create or replace function public.pilgrim_payment_penalidad_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'penalidad' then
    new.fx_recalc := false;
    new.account := null;
    new.method := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_penalidad_defaults on public.pilgrim_payments;
create trigger trg_penalidad_defaults
  before insert or update on public.pilgrim_payments
  for each row execute function public.pilgrim_payment_penalidad_defaults();

-- ── 2. La penalidad que ya estaba cargada en la inscripción ─────────────────

insert into public.pilgrim_payments (registration_id, paid_at, amount, currency, trm_eur_cop, kind, concept, notes)
select r.id,
       current_date,
       - r.penalty_eur,
       'EUR',
       -- De referencia, para poder decir cuántos pesos eran ese día.
       trm_at_or_before(current_date),
       'penalidad',
       coalesce(nullif(btrim(r.penalty_note), ''), 'Penalidad por cambio de grupo'),
       'Migrada desde la penalidad que estaba sumada al precio de la inscripción.'
  from public.registrations r
 where coalesce(r.penalty_eur, 0) > 0
   and not exists (
     select 1 from public.pilgrim_payments pp
      where pp.registration_id = r.id and pp.kind = 'penalidad'
   );

update public.registrations set penalty_eur = 0, penalty_note = null
 where coalesce(penalty_eur, 0) <> 0 or penalty_note is not null;

comment on column public.registrations.penalty_eur is
  'OBSOLETA. La penalidad ahora es un movimiento negativo en pilgrim_payments (kind = penalidad). Ninguna vista ni pantalla la lee.';
comment on column public.registrations.penalty_note is
  'OBSOLETA. Ver pilgrim_payments.concept.';

-- ── 3. Vistas ───────────────────────────────────────────────────────────────

create or replace view public.v_pilgrim_payment_settlement as
 SELECT pp.id,
    pp.registration_id,
    pp.paid_at,
    pp.amount,
    pp.currency,
    pp.trm_eur_cop,
    pp.usd_eur_rate,
    pp.amount_eur,
    pp.method,
    pp.account,
    pp.reference,
    pp.notes,
    pp.kind,
    sr.settlement_trm,
    payment_fx_recalc(pp.currency, pp.method, pp.fx_recalc) AS se_revalora,
        CASE
            WHEN payment_fx_recalc(pp.currency, pp.method, pp.fx_recalc) AND sr.settlement_trm IS NOT NULL AND sr.settlement_trm > 0::numeric THEN round(pp.amount / sr.settlement_trm, 2)
            ELSE pp.amount_eur
        END AS amount_eur_cierre,
        CASE
            WHEN payment_fx_recalc(pp.currency, pp.method, pp.fx_recalc) AND sr.settlement_trm IS NOT NULL AND sr.settlement_trm > 0::numeric THEN round(pp.amount / sr.settlement_trm, 2) - pp.amount_eur
            ELSE 0::numeric
        END AS fx_diff_eur,
    pp.concept
   FROM pilgrim_payments pp
     JOIN v_registration_settlement_rate sr ON sr.registration_id = pp.registration_id;

-- Se recrean en cadena porque v_pilgrim_settlement cambia de columnas
-- (penalty_eur / penalty_note salen; entran las de la penalidad-movimiento).
drop view if exists public.v_financial_global;
drop view if exists public.v_departure_finance;
drop view if exists public.v_upcoming_installments;
drop view if exists public.v_installment_status;
drop view if exists public.v_pilgrim_balance;
drop view if exists public.v_pilgrim_settlement;

create view public.v_pilgrim_settlement as
WITH pagos AS (
         SELECT ps.registration_id,
            COALESCE(sum(ps.amount_eur), 0::numeric) AS paid_eur_historico,
            COALESCE(sum(ps.amount_eur_cierre), 0::numeric) AS paid_eur_cierre,
            COALESCE(sum(ps.fx_diff_eur), 0::numeric) AS fx_difference_eur,
            COALESCE(sum(CASE WHEN ps.se_revalora THEN ps.amount ELSE 0::numeric END), 0::numeric) AS cop_revalorado,
            -- La penalidad se muestra en su propio renglón, así que no entra en
            -- «abonos ya en euros».
            COALESCE(sum(CASE WHEN ps.se_revalora OR ps.kind = 'penalidad'::text THEN 0::numeric ELSE ps.amount_eur END), 0::numeric) AS eur_fijo,
            count(*) FILTER (WHERE ps.kind = 'cierre'::text) AS pagos_cierre,
            COALESCE(sum(CASE WHEN ps.kind = 'devolucion'::text THEN - ps.amount_eur_cierre ELSE 0::numeric END), 0::numeric) AS devuelto_eur,
            COALESCE(sum(CASE WHEN ps.kind = 'devolucion'::text AND ps.currency = 'COP'::text THEN - ps.amount ELSE 0::numeric END), 0::numeric) AS devuelto_cop,
            COALESCE(sum(CASE WHEN ps.kind = 'devolucion'::text THEN 0::numeric ELSE ps.amount_eur_cierre END), 0::numeric) AS acreditado_eur,
            -- En positivo: lo que la penalidad le resta a sus abonos.
            COALESCE(sum(CASE WHEN ps.kind = 'penalidad'::text THEN - ps.amount_eur_cierre ELSE 0::numeric END), 0::numeric) AS penalidad_eur,
            -- Los pesos de la penalidad: los que se pactaron si fue en COP, o su
            -- equivalente a la tasa de referencia del día si se pactó en euros.
            NULLIF(COALESCE(sum(CASE WHEN ps.kind = 'penalidad'::text THEN CASE WHEN ps.currency = 'COP'::text THEN - ps.amount WHEN ps.trm_eur_cop IS NOT NULL THEN round(- ps.amount_eur * ps.trm_eur_cop) ELSE 0::numeric END ELSE 0::numeric END), 0::numeric), 0::numeric) AS penalidad_cop,
            string_agg(DISTINCT ps.concept, ' · ') FILTER (WHERE ps.kind = 'penalidad'::text AND ps.concept IS NOT NULL) AS penalidad_concepto
           FROM v_pilgrim_payment_settlement ps
          GROUP BY ps.registration_id
        ), base AS (
         SELECT r.id AS registration_id,
            r.departure_id,
            r.pilgrim_id,
            p.full_name AS pilgrim_name,
            p.is_team,
            d.name AS departure_name,
            d.start_date,
            r.status,
            r.total_eur - r.discount_eur AS net_total_eur,
            sr.settlement_trm,
            sr.settlement_date,
            sr.settlement_source,
            sr.settlement_mode,
            COALESCE(pg.paid_eur_historico, 0::numeric) AS paid_eur_historico,
            COALESCE(pg.paid_eur_cierre, 0::numeric) AS paid_eur_cierre,
            COALESCE(pg.fx_difference_eur, 0::numeric) AS fx_difference_eur,
            COALESCE(pg.cop_revalorado, 0::numeric) AS cop_revalorado,
            COALESCE(pg.eur_fijo, 0::numeric) AS eur_fijo,
            COALESCE(pg.pagos_cierre, 0::bigint) AS pagos_cierre,
            COALESCE(pg.devuelto_eur, 0::numeric) AS devuelto_eur,
            COALESCE(pg.devuelto_cop, 0::numeric) AS devuelto_cop,
            COALESCE(pg.acreditado_eur, 0::numeric) AS acreditado_eur,
            COALESCE(pg.penalidad_eur, 0::numeric) AS penalidad_eur,
            pg.penalidad_cop,
            pg.penalidad_concepto,
            r.total_eur - r.discount_eur - COALESCE(pg.paid_eur_historico, 0::numeric) AS pending_eur_historico,
                CASE
                    WHEN sr.settlement_trm IS NOT NULL AND sr.settlement_trm > 0::numeric THEN r.total_eur - r.discount_eur - COALESCE(pg.paid_eur_cierre, 0::numeric)
                    ELSE r.total_eur - r.discount_eur - COALESCE(pg.paid_eur_historico, 0::numeric)
                END AS saldo_final_eur
           FROM registrations r
             JOIN departures d ON d.id = r.departure_id
             JOIN pilgrims p ON p.id = r.pilgrim_id
             JOIN v_registration_settlement_rate sr ON sr.registration_id = r.id
             LEFT JOIN pagos pg ON pg.registration_id = r.id
        )
 SELECT registration_id,
    departure_id,
    pilgrim_id,
    pilgrim_name,
    is_team,
    departure_name,
    start_date,
    status,
    net_total_eur,
    settlement_trm,
    settlement_date,
    settlement_source,
    paid_eur_historico,
    paid_eur_cierre,
    fx_difference_eur,
    cop_revalorado,
    eur_fijo,
    pagos_cierre,
    devuelto_eur,
    devuelto_cop,
    acreditado_eur,
    pending_eur_historico,
    saldo_final_eur,
        CASE WHEN settlement_trm IS NOT NULL AND settlement_trm > 0::numeric THEN round(saldo_final_eur * settlement_trm) ELSE NULL::numeric END AS saldo_final_cop,
        CASE WHEN settlement_trm IS NOT NULL AND settlement_trm > 0::numeric THEN round(net_total_eur * settlement_trm) ELSE NULL::numeric END AS total_cop_cierre,
        CASE WHEN saldo_final_eur > 0.5 THEN saldo_final_eur ELSE 0::numeric END AS por_cobrar_eur,
        CASE WHEN saldo_final_eur < '-0.5'::numeric THEN - saldo_final_eur ELSE 0::numeric END AS por_devolver_eur,
        CASE WHEN settlement_trm IS NOT NULL AND settlement_trm > 0::numeric THEN round(CASE WHEN saldo_final_eur > 0.5 THEN saldo_final_eur ELSE 0::numeric END * settlement_trm) ELSE NULL::numeric END AS por_cobrar_cop,
        CASE WHEN settlement_trm IS NOT NULL AND settlement_trm > 0::numeric THEN round(CASE WHEN saldo_final_eur < '-0.5'::numeric THEN - saldo_final_eur ELSE 0::numeric END * settlement_trm) ELSE NULL::numeric END AS por_devolver_cop,
        CASE
            WHEN settlement_mode = 'recalculo'::text AND (settlement_trm IS NULL OR settlement_trm <= 0::numeric) THEN 'sin_tasa'::text
            WHEN saldo_final_eur > 0.5 THEN 'por_cobrar'::text
            WHEN saldo_final_eur < '-0.5'::numeric THEN 'por_devolver'::text
            WHEN devuelto_eur > 0.005 THEN 'devuelto'::text
            ELSE 'liquidado'::text
        END AS estado_liquidacion,
    settlement_mode,
    penalidad_eur,
    penalidad_cop,
    penalidad_concepto
   FROM base b;

comment on view public.v_pilgrim_settlement is
  'Liquidación por inscripción. net_total_eur es el precio acordado (total − descuento): la penalidad NO se suma acá, viene restada dentro de paid_eur_* como movimiento kind = penalidad. penalidad_eur la expone en positivo para poder mostrarla en su renglón.';

create view public.v_pilgrim_balance as
 SELECT s.registration_id,
    s.departure_id,
    s.pilgrim_id,
    s.departure_name,
    s.start_date,
    s.pilgrim_name,
    r.total_eur,
    r.discount_eur,
    s.net_total_eur,
    s.paid_eur_historico AS paid_eur,
    s.pending_eur_historico AS pending_eur,
    r.frozen_trm_eur_cop,
    r.frozen_trm_date,
    r.paid_in_cop_originally,
    COALESCE(s.saldo_final_cop, round(s.pending_eur_historico * COALESCE(trm_at_or_before(CURRENT_DATE), 0::numeric))) AS pending_cop_reference,
    s.status,
    r.refund_status,
    s.settlement_trm,
    s.settlement_date,
    s.settlement_source,
    s.paid_eur_cierre,
    s.fx_difference_eur,
    s.saldo_final_eur,
    s.saldo_final_cop,
    s.total_cop_cierre,
    s.por_cobrar_eur,
    s.por_cobrar_cop,
    s.por_devolver_eur,
    s.por_devolver_cop,
    s.devuelto_eur,
    s.devuelto_cop,
    s.pagos_cierre,
    s.estado_liquidacion,
    s.cop_revalorado,
    s.eur_fijo,
    s.is_team,
    s.settlement_mode,
    s.penalidad_eur,
    s.penalidad_cop,
    s.penalidad_concepto
   FROM v_pilgrim_settlement s
     JOIN registrations r ON r.id = s.registration_id;

create view public.v_installment_status as
WITH paid AS (
         SELECT s.registration_id,
            s.acreditado_eur AS total_paid_eur
           FROM v_pilgrim_settlement s
        ), inst AS (
         SELECT i.id,
            i.registration_id,
            i."position",
            i.label,
            i.due_date,
            i.amount_eur,
            i.paid_at,
            i.paid_payment_id,
            i.status,
            i.notes,
            i.created_at,
            i.updated_at,
            sum(i.amount_eur) OVER (PARTITION BY i.registration_id ORDER BY i."position", i.due_date, i.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_amount_eur
           FROM payment_plan_installments i
        )
 SELECT inst.id,
    inst.registration_id,
    inst."position",
    inst.label,
    inst.due_date,
    inst.amount_eur AS scheduled_amount_eur,
    round(GREATEST(0::numeric, LEAST(inst.amount_eur, COALESCE(paid.total_paid_eur, 0::numeric) - (inst.cum_amount_eur - inst.amount_eur))), 2) AS paid_eur,
    round(GREATEST(0::numeric, LEAST(inst.amount_eur, inst.cum_amount_eur - COALESCE(paid.total_paid_eur, 0::numeric))), 2) AS remaining_eur,
        CASE
            WHEN inst.cum_amount_eur - COALESCE(paid.total_paid_eur, 0::numeric) <= 1.0 THEN 'pagada'::text
            WHEN inst.due_date < CURRENT_DATE THEN 'vencida'::text
            ELSE 'pendiente'::text
        END AS status,
    inst.due_date - CURRENT_DATE AS days_until_due
   FROM inst
     LEFT JOIN paid ON paid.registration_id = inst.registration_id;

create view public.v_upcoming_installments as
 SELECT s.id,
    s.registration_id,
    s.due_date,
    s.remaining_eur AS amount_eur,
    s.label,
    s.status,
    p.id AS pilgrim_id,
    p.full_name AS pilgrim_name,
    d.id AS departure_id,
    d.name AS departure_name,
    d.start_date AS departure_start_date,
    s.days_until_due,
    s.scheduled_amount_eur
   FROM v_installment_status s
     JOIN registrations r ON r.id = s.registration_id
     JOIN pilgrims p ON p.id = r.pilgrim_id
     JOIN departures d ON d.id = r.departure_id
  WHERE r.status <> 'cancelado'::text AND s.remaining_eur > 1.0
  ORDER BY s.due_date;

create view public.v_departure_finance as
WITH penalidades AS (
         SELECT pp.registration_id,
            - sum(pp.amount_eur) AS eur
           FROM pilgrim_payments pp
          WHERE pp.kind = 'penalidad'::text
          GROUP BY pp.registration_id
        ), counts AS (
         SELECT d_1.id AS departure_id,
            COALESCE(sum(CASE WHEN p.is_team = false AND r.status <> 'cancelado'::text THEN 1 ELSE 0 END), 0::bigint)::integer AS pagantes_count,
            COALESCE(sum(CASE WHEN p.is_team = true AND r.status <> 'cancelado'::text THEN 1 ELSE 0 END), 0::bigint)::integer AS team_count
           FROM departures d_1
             LEFT JOIN registrations r ON r.departure_id = d_1.id
             LEFT JOIN pilgrims p ON p.id = r.pilgrim_id
          GROUP BY d_1.id
        ), revenue AS (
         -- El ingreso esperado sí incluye la penalidad: para el negocio es plata
         -- a cobrar, aunque en el recibo del peregrino se vea restando abonos.
         SELECT d_1.id AS departure_id,
            COALESCE(sum(CASE WHEN p.is_team = false AND r.status <> 'cancelado'::text THEN r.total_eur - r.discount_eur + COALESCE(pen.eur, 0::numeric) ELSE 0::numeric END), 0::numeric) AS expected_revenue_eur
           FROM departures d_1
             LEFT JOIN registrations r ON r.departure_id = d_1.id
             LEFT JOIN pilgrims p ON p.id = r.pilgrim_id
             LEFT JOIN penalidades pen ON pen.registration_id = r.id
          GROUP BY d_1.id
        ), collected AS (
         -- La caja recaudada no cuenta las penalidades: no entró plata.
         SELECT d_1.id AS departure_id,
            COALESCE(sum(CASE WHEN p.is_team = false AND pp.kind <> 'penalidad'::text THEN pp.amount_eur ELSE 0::numeric END), 0::numeric) AS collected_revenue_eur,
            COALESCE(sum(CASE WHEN p.is_team = false AND r.status <> 'cancelado'::text AND pp.kind <> 'penalidad'::text THEN pp.amount_eur ELSE 0::numeric END), 0::numeric) AS collected_active_eur
           FROM departures d_1
             LEFT JOIN registrations r ON r.departure_id = d_1.id
             LEFT JOIN pilgrims p ON p.id = r.pilgrim_id
             LEFT JOIN pilgrim_payments pp ON pp.registration_id = r.id
          GROUP BY d_1.id
        ), settlement AS (
         SELECT s.departure_id,
            COALESCE(sum(CASE WHEN s.is_team = false AND s.status <> 'cancelado'::text THEN s.por_cobrar_eur ELSE 0::numeric END), 0::numeric) AS pending_settled_eur,
            COALESCE(sum(CASE WHEN s.is_team = false AND s.status <> 'cancelado'::text THEN s.por_devolver_eur ELSE 0::numeric END), 0::numeric) AS por_devolver_eur,
            COALESCE(sum(CASE WHEN s.is_team = false AND s.status <> 'cancelado'::text THEN s.fx_difference_eur ELSE 0::numeric END), 0::numeric) AS fx_difference_eur,
            COALESCE(sum(CASE WHEN s.is_team = false AND s.status <> 'cancelado'::text AND s.estado_liquidacion <> 'sin_tasa'::text THEN 1 ELSE 0 END), 0::bigint)::integer AS liquidados_count
           FROM v_pilgrim_settlement s
          GROUP BY s.departure_id
        ), costs AS (
         SELECT d_1.id AS departure_id,
            COALESCE(sum(CASE WHEN b.scaling = 'fijo_grupo'::text THEN COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur) * b.quantity ELSE 0::numeric END), 0::numeric) AS fijo_grupo_eur,
            COALESCE(sum(CASE WHEN b.scaling = 'por_inscrito'::text THEN COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur) ELSE 0::numeric END), 0::numeric) AS por_inscrito_unit_eur,
            COALESCE(sum(CASE WHEN b.scaling = 'por_pagante'::text THEN COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur) ELSE 0::numeric END), 0::numeric) AS por_pagante_unit_eur,
            COALESCE(sum(CASE WHEN b.scaling = 'viatico_team'::text THEN COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur) * b.quantity ELSE 0::numeric END), 0::numeric) AS viatico_team_eur
           FROM departures d_1
             LEFT JOIN budget_items b ON b.departure_id = d_1.id AND b.status <> 'cancelado'::text
          GROUP BY d_1.id
        )
 SELECT d.id AS departure_id,
    d.name,
    d.start_date,
    d.end_date,
    d.status,
    d.capacity,
    c.pagantes_count,
    c.team_count,
    c.pagantes_count + c.team_count AS inscritos_total,
    rev.expected_revenue_eur,
    col.collected_revenue_eur,
    rev.expected_revenue_eur - col.collected_active_eur AS pending_revenue_eur,
    cs.fijo_grupo_eur,
    cs.por_inscrito_unit_eur,
    cs.por_pagante_unit_eur,
    cs.viatico_team_eur,
    cs.por_inscrito_unit_eur * (c.pagantes_count + c.team_count)::numeric * (1::numeric + COALESCE(d.variable_buffer_pct, 0::numeric) / 100::numeric) AS costo_por_inscrito_eur,
    cs.por_pagante_unit_eur * c.pagantes_count::numeric * (1::numeric + COALESCE(d.variable_buffer_pct, 0::numeric) / 100::numeric) AS costo_por_pagante_total_eur,
    cs.fijo_grupo_eur + (cs.por_inscrito_unit_eur * (c.pagantes_count + c.team_count)::numeric + cs.por_pagante_unit_eur * c.pagantes_count::numeric) * (1::numeric + COALESCE(d.variable_buffer_pct, 0::numeric) / 100::numeric) + cs.viatico_team_eur AS costo_total_eur,
        CASE
            WHEN c.pagantes_count > 0 THEN (cs.fijo_grupo_eur + (cs.por_inscrito_unit_eur * (c.pagantes_count + c.team_count)::numeric + cs.por_pagante_unit_eur * c.pagantes_count::numeric) * (1::numeric + COALESCE(d.variable_buffer_pct, 0::numeric) / 100::numeric) + cs.viatico_team_eur) / c.pagantes_count::numeric
            ELSE NULL::numeric
        END AS costo_por_pagante_unitario_eur,
        CASE
            WHEN c.pagantes_count > 0 THEN rev.expected_revenue_eur / c.pagantes_count::numeric
            ELSE NULL::numeric
        END AS precio_promedio_pagante_eur,
    rev.expected_revenue_eur - (cs.fijo_grupo_eur + (cs.por_inscrito_unit_eur * (c.pagantes_count + c.team_count)::numeric + cs.por_pagante_unit_eur * c.pagantes_count::numeric) * (1::numeric + COALESCE(d.variable_buffer_pct, 0::numeric) / 100::numeric) + cs.viatico_team_eur) AS utilidad_total_eur,
        CASE
            WHEN c.pagantes_count > 0 THEN (rev.expected_revenue_eur - (cs.fijo_grupo_eur + (cs.por_inscrito_unit_eur * (c.pagantes_count + c.team_count)::numeric + cs.por_pagante_unit_eur * c.pagantes_count::numeric) * (1::numeric + COALESCE(d.variable_buffer_pct, 0::numeric) / 100::numeric) + cs.viatico_team_eur)) / c.pagantes_count::numeric
            ELSE NULL::numeric
        END AS utilidad_por_pagante_eur,
    d.trm_frozen_at_date,
    d.trm_frozen_value,
    (cs.por_inscrito_unit_eur + cs.por_pagante_unit_eur) * c.pagantes_count::numeric * (1::numeric + COALESCE(d.variable_buffer_pct, 0::numeric) / 100::numeric) AS costo_peregrinos_eur,
    cs.viatico_team_eur + cs.por_inscrito_unit_eur * c.team_count::numeric * (1::numeric + COALESCE(d.variable_buffer_pct, 0::numeric) / 100::numeric) AS costo_equipo_eur,
    COALESCE(d.variable_buffer_pct, 0::numeric) AS variable_buffer_pct,
    COALESCE(st.pending_settled_eur, 0::numeric) AS pending_settled_eur,
    COALESCE(st.por_devolver_eur, 0::numeric) AS por_devolver_eur,
    COALESCE(st.fx_difference_eur, 0::numeric) AS fx_difference_eur,
    COALESCE(st.liquidados_count, 0) AS liquidados_count,
    d.settlement_mode
   FROM departures d
     LEFT JOIN counts c ON c.departure_id = d.id
     LEFT JOIN revenue rev ON rev.departure_id = d.id
     LEFT JOIN collected col ON col.departure_id = d.id
     LEFT JOIN costs cs ON cs.departure_id = d.id
     LEFT JOIN settlement st ON st.departure_id = d.id;

create view public.v_financial_global as
WITH revenue AS (
         SELECT COALESCE(sum(pilgrim_payments.amount_eur), 0::numeric) AS collected
           FROM pilgrim_payments
          WHERE pilgrim_payments.kind <> 'penalidad'::text
        ), expected AS (
         SELECT COALESCE(sum(v_departure_finance.expected_revenue_eur), 0::numeric) AS expected
           FROM v_departure_finance
        ), pending AS (
         SELECT COALESCE(sum(v_departure_finance.pending_revenue_eur), 0::numeric) AS pending
           FROM v_departure_finance
        ), settled AS (
         SELECT COALESCE(sum(v_departure_finance.pending_settled_eur), 0::numeric) AS pending_settled,
            COALESCE(sum(v_departure_finance.por_devolver_eur), 0::numeric) AS por_devolver,
            COALESCE(sum(v_departure_finance.fx_difference_eur), 0::numeric) AS fx_difference
           FROM v_departure_finance
        ), paid_providers AS (
         SELECT COALESCE(sum(provider_payments.amount_eur), 0::numeric) AS v
           FROM provider_payments
        ), ops_expenses AS (
         SELECT COALESCE(sum(expenses.amount_eur), 0::numeric) AS v
           FROM expenses
          WHERE expenses.kind = 'operativo'::text
        ), personal_expenses AS (
         SELECT COALESCE(sum(expenses.amount_eur), 0::numeric) AS v
           FROM expenses
          WHERE expenses.kind = 'personal'::text
        ), estimated_cost AS (
         SELECT COALESCE(sum(v_departure_finance.costo_total_eur), 0::numeric) AS v
           FROM v_departure_finance
        )
 SELECT (SELECT revenue.collected FROM revenue) AS collected_eur,
    (SELECT expected.expected FROM expected) AS expected_revenue_eur,
    (SELECT pending.pending FROM pending) AS pending_revenue_eur,
    (SELECT paid_providers.v FROM paid_providers) AS paid_providers_eur,
    (SELECT ops_expenses.v FROM ops_expenses) AS operational_expenses_eur,
    (SELECT personal_expenses.v FROM personal_expenses) AS personal_withdrawals_eur,
    (SELECT estimated_cost.v FROM estimated_cost) AS estimated_total_cost_eur,
    (SELECT expected.expected FROM expected) - (SELECT estimated_cost.v FROM estimated_cost) AS projected_profit_eur,
    (SELECT revenue.collected FROM revenue) - (SELECT paid_providers.v FROM paid_providers) - (SELECT ops_expenses.v FROM ops_expenses) AS realized_operational_profit_eur,
    (SELECT revenue.collected FROM revenue) - (SELECT paid_providers.v FROM paid_providers) - (SELECT ops_expenses.v FROM ops_expenses) - (SELECT personal_expenses.v FROM personal_expenses) AS cash_available_eur,
    (SELECT settled.pending_settled FROM settled) AS pending_settled_eur,
    (SELECT settled.por_devolver FROM settled) AS por_devolver_eur,
    (SELECT settled.fx_difference FROM settled) AS fx_difference_eur;

-- v_departure_summary y las vistas de cuentas: misma regla, la penalidad no es caja.
create or replace view public.v_departure_summary as
WITH counts AS (
         SELECT d_1.id AS departure_id,
            COALESCE(sum(CASE WHEN p.is_team = false AND r.status <> 'cancelado'::text THEN 1 ELSE 0 END), 0::bigint)::integer AS pagantes,
            COALESCE(sum(CASE WHEN p.is_team = true AND r.status <> 'cancelado'::text THEN 1 ELSE 0 END), 0::bigint)::integer AS team
           FROM departures d_1
             LEFT JOIN registrations r ON r.departure_id = d_1.id
             LEFT JOIN pilgrims p ON p.id = r.pilgrim_id
          GROUP BY d_1.id
        ), costs AS (
         SELECT d_1.id AS departure_id,
            COALESCE(sum(CASE WHEN b.scaling = 'fijo_grupo'::text THEN b.estimated_unit_cost_eur * b.quantity ELSE 0::numeric END), 0::numeric) AS est_fijo,
            COALESCE(sum(CASE WHEN b.scaling = 'por_inscrito'::text THEN b.estimated_unit_cost_eur ELSE 0::numeric END), 0::numeric) AS est_inscrito_unit,
            COALESCE(sum(CASE WHEN b.scaling = 'por_pagante'::text THEN b.estimated_unit_cost_eur ELSE 0::numeric END), 0::numeric) AS est_pagante_unit,
            COALESCE(sum(CASE WHEN b.scaling = 'viatico_team'::text THEN b.estimated_unit_cost_eur * b.quantity ELSE 0::numeric END), 0::numeric) AS est_viatico,
            COALESCE(sum(CASE WHEN b.scaling = 'fijo_grupo'::text THEN COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur) * b.quantity ELSE 0::numeric END), 0::numeric) AS coe_fijo,
            COALESCE(sum(CASE WHEN b.scaling = 'por_inscrito'::text THEN COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur) ELSE 0::numeric END), 0::numeric) AS coe_inscrito_unit,
            COALESCE(sum(CASE WHEN b.scaling = 'por_pagante'::text THEN COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur) ELSE 0::numeric END), 0::numeric) AS coe_pagante_unit,
            COALESCE(sum(CASE WHEN b.scaling = 'viatico_team'::text THEN COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur) * b.quantity ELSE 0::numeric END), 0::numeric) AS coe_viatico
           FROM departures d_1
             LEFT JOIN budget_items b ON b.departure_id = d_1.id AND b.status <> 'cancelado'::text
          GROUP BY d_1.id
        )
 SELECT d.id AS departure_id,
    d.name,
    d.start_date,
    d.end_date,
    d.status,
    d.capacity,
    ( SELECT count(*) AS count
           FROM registrations r
          WHERE r.departure_id = d.id AND r.status <> 'cancelado'::text) AS pilgrims_count,
    ( SELECT COALESCE(sum(CASE WHEN p.is_team = false AND r.status <> 'cancelado'::text THEN r.total_eur - r.discount_eur + COALESCE(pen.eur, 0::numeric) ELSE 0::numeric END), 0::numeric) AS "coalesce"
           FROM registrations r
             LEFT JOIN pilgrims p ON p.id = r.pilgrim_id
             LEFT JOIN ( SELECT pp.registration_id, - sum(pp.amount_eur) AS eur
                           FROM pilgrim_payments pp
                          WHERE pp.kind = 'penalidad'::text
                          GROUP BY pp.registration_id) pen ON pen.registration_id = r.id
          WHERE r.departure_id = d.id) AS expected_revenue_eur,
    ( SELECT COALESCE(sum(pp.amount_eur), 0::numeric) AS "coalesce"
           FROM pilgrim_payments pp
             JOIN registrations r ON r.id = pp.registration_id
          WHERE r.departure_id = d.id AND pp.kind <> 'penalidad'::text) AS collected_revenue_eur,
    cs.est_fijo + (cs.est_inscrito_unit * (c.pagantes + c.team)::numeric + cs.est_pagante_unit * c.pagantes::numeric) * (1::numeric + COALESCE(d.variable_buffer_pct, 0::numeric) / 100::numeric) + cs.est_viatico AS estimated_cost_eur,
    cs.coe_fijo + (cs.coe_inscrito_unit * (c.pagantes + c.team)::numeric + cs.coe_pagante_unit * c.pagantes::numeric) * (1::numeric + COALESCE(d.variable_buffer_pct, 0::numeric) / 100::numeric) + cs.coe_viatico AS confirmed_or_estimated_cost_eur,
    ( SELECT COALESCE(sum(pp.amount_eur), 0::numeric) AS "coalesce"
           FROM provider_payments pp
          WHERE pp.departure_id = d.id) AS paid_to_providers_eur,
    ( SELECT COALESCE(sum(e.amount_eur), 0::numeric) AS "coalesce"
           FROM expenses e
          WHERE e.departure_id = d.id AND e.kind = 'operativo'::text) AS operational_expenses_eur,
    d.trm_frozen_at_date,
    d.trm_frozen_value
   FROM departures d
     LEFT JOIN counts c ON c.departure_id = d.id
     LEFT JOIN costs cs ON cs.departure_id = d.id;

create or replace view public.v_account_balances as
WITH ingresos AS (
         SELECT COALESCE(pilgrim_payments.account, '(sin cuenta)'::text) AS account,
            COALESCE(sum(pilgrim_payments.amount_eur), 0::numeric) AS eur
           FROM pilgrim_payments
          WHERE pilgrim_payments.kind <> 'penalidad'::text
          GROUP BY COALESCE(pilgrim_payments.account, '(sin cuenta)'::text)
        ), egresos_prov AS (
         SELECT COALESCE(provider_payments.account, '(sin cuenta)'::text) AS account,
            COALESCE(sum(provider_payments.amount_eur), 0::numeric) AS eur
           FROM provider_payments
          GROUP BY COALESCE(provider_payments.account, '(sin cuenta)'::text)
        ), egresos_op AS (
         SELECT COALESCE(expenses.account, '(sin cuenta)'::text) AS account,
            COALESCE(sum(expenses.amount_eur), 0::numeric) AS eur
           FROM expenses
          WHERE expenses.kind = 'operativo'::text
          GROUP BY COALESCE(expenses.account, '(sin cuenta)'::text)
        ), egresos_pers AS (
         SELECT COALESCE(expenses.account, '(sin cuenta)'::text) AS account,
            COALESCE(sum(expenses.amount_eur), 0::numeric) AS eur
           FROM expenses
          WHERE expenses.kind = 'personal'::text
          GROUP BY COALESCE(expenses.account, '(sin cuenta)'::text)
        ), all_accounts AS (
         SELECT ingresos.account FROM ingresos
        UNION
         SELECT egresos_prov.account FROM egresos_prov
        UNION
         SELECT egresos_op.account FROM egresos_op
        UNION
         SELECT egresos_pers.account FROM egresos_pers
        )
 SELECT a.account,
    COALESCE(i.eur, 0::numeric) AS ingresos_eur,
    COALESCE(ep.eur, 0::numeric) AS egresos_proveedores_eur,
    COALESCE(eo.eur, 0::numeric) AS egresos_operativos_eur,
    COALESCE(eper.eur, 0::numeric) AS egresos_personales_eur,
    COALESCE(i.eur, 0::numeric) - COALESCE(ep.eur, 0::numeric) - COALESCE(eo.eur, 0::numeric) - COALESCE(eper.eur, 0::numeric) AS saldo_eur
   FROM all_accounts a
     LEFT JOIN ingresos i USING (account)
     LEFT JOIN egresos_prov ep USING (account)
     LEFT JOIN egresos_op eo USING (account)
     LEFT JOIN egresos_pers eper USING (account);

create or replace view public.v_account_currency_breakdown as
WITH mov AS (
         SELECT COALESCE(pilgrim_payments.account, '(sin cuenta)'::text) AS account,
            'ingreso'::text AS direction,
            pilgrim_payments.currency,
            pilgrim_payments.amount,
            pilgrim_payments.amount_eur
           FROM pilgrim_payments
          WHERE pilgrim_payments.kind <> 'penalidad'::text
        UNION ALL
         SELECT COALESCE(provider_payments.account, '(sin cuenta)'::text) AS "coalesce",
            'egreso'::text AS text,
            provider_payments.currency,
            provider_payments.amount,
            provider_payments.amount_eur
           FROM provider_payments
        UNION ALL
         SELECT COALESCE(expenses.account, '(sin cuenta)'::text) AS "coalesce",
            'egreso'::text AS text,
            expenses.currency,
            expenses.amount,
            expenses.amount_eur
           FROM expenses
        )
 SELECT account,
    direction,
    currency,
    count(*)::integer AS movimientos,
    COALESCE(sum(amount), 0::numeric) AS monto_origen,
    COALESCE(sum(amount_eur), 0::numeric) AS monto_eur,
        CASE
            WHEN currency <> 'EUR'::text AND COALESCE(sum(amount_eur), 0::numeric) > 0::numeric THEN round(sum(amount) / sum(amount_eur), 2)
            ELSE NULL::numeric
        END AS tasa_promedio
   FROM mov
  GROUP BY account, direction, currency;

grant select, insert, update, delete, truncate, references, trigger
  on public.v_pilgrim_settlement, public.v_pilgrim_balance, public.v_installment_status,
     public.v_upcoming_installments, public.v_departure_finance, public.v_financial_global
  to anon, authenticated, service_role, postgres;
