-- PROPUESTA (NO aplicada): el costo de un camino es lo CONTRATADO con cada proveedor.
-- Auditoría de cuentas 2026-09-29, hallazgos C-3 y C-4 (auditoria/hallazgos-cuentas.md).
--
-- Hoy cada reserva se vuelve un ítem "por inscrito" (costo ÷ camas) que se multiplica por los
-- inscritos y por la contingencia. Así el costo baja cuando hay menos inscritos aunque el contrato
-- sea fijo, las camas vacías desaparecen del costo y la contingencia se aplica encima de reservas
-- ya pagadas con monto exacto. Efecto medido el 2026-09-29 (solo lectura):
--
--   Camino                    costo modelo  costo contratado  utilidad modelo  utilidad contratada  falta modelo  falta contratada
--   Francés — Abril 2027        17.121,25        22.998,13         17.120,75          11.243,87      17.121,25        22.998,13
--   Francés — Septiembre 2026   19.545,89        18.933,52         12.336,11          12.948,48      10.647,87        10.053,00
--
-- Con esto, "Falta por pagar" de la tarjeta = la suma de las filas = el informe de giros (hoy no cuadran).
-- Los ítems SIN reserva siguen con su regla por escala. El simulador de escenarios y el punto de
-- equilibrio siguen usando el modelo por persona (sirven para decidir cupos antes de contratar).
--
-- Requiere OK de Nico. Para aplicar: apply_migration con este contenido y copiarlo sin "_PROPUESTA".

create or replace view public.v_budget_payable with (security_invoker = on) as
 WITH counts AS (
         SELECT d.id AS departure_id,
            (COALESCE(sum(CASE WHEN ((p.is_team = false) AND (r.status <> 'cancelado')) THEN 1 ELSE 0 END), 0))::integer AS pagantes,
            (COALESCE(sum(CASE WHEN ((p.is_team = true) AND (r.status <> 'cancelado')) THEN 1 ELSE 0 END), 0))::integer AS team
           FROM departures d
             LEFT JOIN registrations r ON r.departure_id = d.id
             LEFT JOIN pilgrims p ON p.id = r.pilgrim_id
          GROUP BY d.id
        ), res_paid AS (
         SELECT reservation_id, sum(amount_eur) AS paid_eur
           FROM provider_payments WHERE reservation_id IS NOT NULL GROUP BY reservation_id
        ), res_owner AS (
         SELECT id, reservation_id,
                row_number() OVER (PARTITION BY reservation_id ORDER BY "position", created_at, id) AS rn
           FROM budget_items WHERE reservation_id IS NOT NULL AND status <> 'cancelado'
        ), item_paid AS (
         SELECT x.budget_item_id, sum(x.amount_eur) AS paid_eur
           FROM ( SELECT budget_item_id, amount_eur FROM provider_payments
                   WHERE budget_item_id IS NOT NULL AND reservation_id IS NULL
                  UNION ALL
                  SELECT budget_item_id, amount_eur FROM expenses WHERE budget_item_id IS NOT NULL) x
          GROUP BY x.budget_item_id
        ), base AS (
         SELECT b.id AS budget_item_id, b.departure_id, b.category, b.description, b.scaling, b.status,
                b.quantity, b.provider_id, b.reservation_id, b.item_date,
                CASE
                  -- Reserva: la línea ES el contrato (una sola vez por reserva, en su primer ítem).
                  WHEN b.reservation_id IS NOT NULL THEN
                    CASE WHEN ro.rn = 1 AND rv.status <> 'cancelado'
                         THEN COALESCE(rv.confirmed_cost_eur, rv.estimated_cost_eur, 0) ELSE 0 END
                  WHEN b.scaling = 'por_inscrito' THEN COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur, 0) * (c.pagantes + c.team) * (1 + COALESCE(d.variable_buffer_pct, 0) / 100)
                  WHEN b.scaling = 'por_pagante'  THEN COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur, 0) * c.pagantes * (1 + COALESCE(d.variable_buffer_pct, 0) / 100)
                  ELSE COALESCE(b.confirmed_unit_cost_eur, b.estimated_unit_cost_eur, 0) * b.quantity
                END AS line_total_eur,
                CASE WHEN b.reservation_id IS NOT NULL
                     THEN CASE WHEN ro.rn = 1 THEN COALESCE(rp.paid_eur, 0) ELSE 0 END
                     ELSE COALESCE(ip.paid_eur, 0) END AS paid_eur
           FROM budget_items b
             JOIN departures d ON d.id = b.departure_id
             JOIN counts c ON c.departure_id = b.departure_id
             LEFT JOIN reservations rv ON rv.id = b.reservation_id
             LEFT JOIN res_paid rp ON rp.reservation_id = b.reservation_id
             LEFT JOIN res_owner ro ON ro.id = b.id
             LEFT JOIN item_paid ip ON ip.budget_item_id = b.id
          WHERE b.status <> 'cancelado'
        )
 SELECT budget_item_id, departure_id, category, description, scaling, status, quantity, provider_id,
        reservation_id, item_date, line_total_eur, paid_eur,
        CASE WHEN status = 'pagado' AND paid_eur = 0 THEN 0 ELSE GREATEST(0, line_total_eur - paid_eur) END AS saldo_eur
   FROM base;

-- v_departure_finance: costo_total_eur y utilidad salen de las mismas líneas (una sola verdad).
-- Se aplica con un create or replace de la vista cambiando SOLO estas tres columnas:
--   costo_total_eur            := (select sum(line_total_eur) from v_budget_payable where departure_id = d.id)
--   costo_por_pagante_unitario := costo_total_eur / pagantes
--   utilidad_total_eur / utilidad_por_pagante_eur := expected_revenue_eur − costo_total_eur (/ pagantes)
-- (el resto de columnas del modelo quedan para el simulador). Escribir la vista completa al aplicar,
-- partiendo de pg_get_viewdef('v_departure_finance') para no perder columnas.
