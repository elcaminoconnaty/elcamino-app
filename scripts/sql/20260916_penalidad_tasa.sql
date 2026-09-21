-- Tasa de la penalidad (2026-09-16): la penalidad (p. ej. por cambio de camino)
-- se pacta un día concreto y a la tasa de ese día. Se guarda la fecha, la tasa
-- COP/EUR y el valor en pesos que se le dijo al peregrino, para que quede
-- registrado aunque la tasa de cierre después sea otra. `penalty_eur` sigue
-- siendo el valor que entra en el total a pagar.
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.
alter table public.registrations
  add column if not exists penalty_date date,
  add column if not exists penalty_trm_eur_cop numeric,
  add column if not exists penalty_cop numeric;

comment on column public.registrations.penalty_date is
  'Día en que se pactó la penalidad. Es el día de la tasa penalty_trm_eur_cop.';
comment on column public.registrations.penalty_trm_eur_cop is
  'Tasa COP/EUR del día de la penalidad. Fija el valor en pesos que se le informó al peregrino.';
comment on column public.registrations.penalty_cop is
  'Penalidad en pesos: penalty_eur × penalty_trm_eur_cop, redondeada a pesos enteros.';

-- Las vistas exponen las tres columnas nuevas al final (así CREATE OR REPLACE no
-- tiene que tumbar nada que dependa de ellas).
create or replace view public.v_pilgrim_settlement as
WITH pagos AS (
         SELECT ps.registration_id,
            COALESCE(sum(ps.amount_eur), 0::numeric) AS paid_eur_historico,
            COALESCE(sum(ps.amount_eur_cierre), 0::numeric) AS paid_eur_cierre,
            COALESCE(sum(ps.fx_diff_eur), 0::numeric) AS fx_difference_eur,
            COALESCE(sum(CASE WHEN ps.se_revalora THEN ps.amount ELSE 0::numeric END), 0::numeric) AS cop_revalorado,
            COALESCE(sum(CASE WHEN ps.se_revalora THEN 0::numeric ELSE ps.amount_eur END), 0::numeric) AS eur_fijo,
            count(*) FILTER (WHERE ps.kind = 'cierre'::text) AS pagos_cierre,
            COALESCE(sum(CASE WHEN ps.kind = 'devolucion'::text THEN - ps.amount_eur_cierre ELSE 0::numeric END), 0::numeric) AS devuelto_eur,
            COALESCE(sum(CASE WHEN ps.kind = 'devolucion'::text AND ps.currency = 'COP'::text THEN - ps.amount ELSE 0::numeric END), 0::numeric) AS devuelto_cop,
            COALESCE(sum(CASE WHEN ps.kind = 'devolucion'::text THEN 0::numeric ELSE ps.amount_eur_cierre END), 0::numeric) AS acreditado_eur
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
            r.total_eur - r.discount_eur + r.penalty_eur AS net_total_eur,
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
            r.total_eur - r.discount_eur + r.penalty_eur - COALESCE(pg.paid_eur_historico, 0::numeric) AS pending_eur_historico,
                CASE
                    WHEN sr.settlement_trm IS NOT NULL AND sr.settlement_trm > 0::numeric THEN r.total_eur - r.discount_eur + r.penalty_eur - COALESCE(pg.paid_eur_cierre, 0::numeric)
                    ELSE r.total_eur - r.discount_eur + r.penalty_eur - COALESCE(pg.paid_eur_historico, 0::numeric)
                END AS saldo_final_eur,
            r.penalty_eur,
            r.penalty_note,
            r.penalty_date,
            r.penalty_trm_eur_cop,
            r.penalty_cop
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
    penalty_eur,
    penalty_note,
    penalty_date,
    penalty_trm_eur_cop,
    penalty_cop
   FROM base b;

create or replace view public.v_pilgrim_balance as
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
    r.penalty_eur,
    r.penalty_note,
    r.penalty_date,
    r.penalty_trm_eur_cop,
    r.penalty_cop
   FROM v_pilgrim_settlement s
     JOIN registrations r ON r.id = s.registration_id;
