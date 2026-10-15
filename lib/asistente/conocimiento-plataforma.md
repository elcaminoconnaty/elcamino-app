# Cómo leer la base de la plataforma

Base Postgres (Supabase), todo en el schema `public`. Consultás con la herramienta
`consultar` (un solo SELECT, máximo 200 filas, solo lectura). La lista completa de tablas y
columnas va más abajo, en "Esquema"; acá está lo que NO se deduce de los nombres.

## Reglas que hay que respetar siempre

- **Precios en euros (EUR).** Los peregrinos pagan en pesos (COP) o en euros; cada pago guarda
  `amount` en su moneda, `trm_eur_cop` (la tasa del día) y `amount_eur`.
- **Quién cuenta como peregrino:** `pilgrims.deleted_at is null`, `pilgrims.is_team = false`
  (Naty, Nico y el equipo van inscritos pero no pagan ni firman) y
  `registrations.status <> 'cancelado'`. Los estados de inscripción son `inscrito`,
  `confirmado` y `cancelado`.
- Una persona (`pilgrims`) se inscribe a un camino (`departures`) con una `registrations`.
  Casi todo cuelga de `registration_id`.
- **Caminos** (`departures`): `name` dice el mes y año ("Camino Francés — Abril 2027"). Para
  "los de abril" filtrá por `name ilike '%abril%'`; si hay más de uno, elegí el próximo (o
  preguntá). Las fechas de `departures` son de operación; las del contrato son
  `contract_start_date` / `contract_end_date`.
- Buscar personas por nombre sin tildes:
  `translate(lower(full_name), 'áéíóúüñ', 'aeiouun') like '%' || translate(lower('texto'), 'áéíóúüñ', 'aeiouun') || '%'`.
  También existe `pilgrims.nickname`. Si hay varias coincidencias, decilo y mostralas.

## Cuánto debe / cuánto ha pagado un peregrino

Usá **`v_pilgrim_settlement`** (una fila por inscripción). Es la misma cifra que muestra la
plataforma en todas partes:
- `net_total_eur`: lo acordado (precio menos descuento).
- `paid_eur_historico`: lo abonado, en euros del día de cada pago.
- **`por_cobrar_eur`**: lo que le falta pagar. **`por_devolver_eur`**: lo que hay que devolverle.
- `estado_liquidacion`: `sin_tasa` (el camino todavía no tiene tasa de cierre: el saldo es
  provisional, a tasas históricas), `liquidado`, `por_devolver`, `devuelto`.
- `por_cobrar_cop` solo existe cuando hay tasa de cierre (`settlement_trm`). Si es nulo y te
  piden pesos, multiplicá `por_cobrar_eur` por la TRM más reciente
  (`select eur_cop from trm_rates order by date desc limit 1`) y aclará que es una referencia
  a la tasa de hoy, no la de cierre.
- **Tasa de cierre:** cuando Nico la fija, los abonos que quedaron en pesos (Bancolombia,
  Nequi, efectivo COP) se re-valoran a esa tasa; los de **Global 66 no** (ahí el euro quedó
  fijo el día del pago). Un camino puede estar en `settlement_mode = 'sin_recalculo'`.
- Los movimientos de un peregrino están en `pilgrim_payments` (o, con el valor de cierre, en
  `v_pilgrim_payment_settlement`). `kind`: `abono`, `cierre` (último pago), `devolucion`
  (monto negativo, plata que salió) y `penalidad` (monto negativo, cargo pactado, p. ej. por
  cambiarse de grupo). `account` = a qué cuenta entró; `method` = medio.
- Cuotas del plan de pagos: `v_installment_status` (`status` pagada | pendiente | vencida,
  `remaining_eur`, `due_date`, `days_until_due`). Próximas cuotas de todos:
  `v_upcoming_installments`.

## Contratos y firmas

- `contracts` (una o más versiones por inscripción). `status`: `borrador`, `enviado`, `visto`,
  `firmado`, `anulado`. El vigente es el que **no** está `anulado` (si hay varios, el de mayor
  `version`). `sent_at`, `viewed_at`, `signed_at` dicen cuándo se mandó, se abrió y se firmó.
- **"¿Quién falta por firmar de abril?"**: peregrinos válidos del camino (reglas de arriba),
  con su contrato vigente. Faltan los que tienen contrato en `borrador`/`enviado`/`visto` y
  también los que **no tienen contrato** (todavía no se generó). Distinguí los tres casos:
  sin contrato, enviado pero sin abrir, abierto pero sin firmar.

  ```sql
  select d.id as departure_id, p.id as pilgrim_id, p.full_name, p.email,
         coalesce(c.status, 'sin contrato') as estado, c.sent_at, c.viewed_at
  from registrations r
  join pilgrims p on p.id = r.pilgrim_id
  join departures d on d.id = r.departure_id
  left join lateral (
    select * from contracts c where c.registration_id = r.id and c.status <> 'anulado'
    order by c.version desc limit 1
  ) c on true
  where d.name ilike '%abril%' and r.status <> 'cancelado'
    and p.deleted_at is null and not p.is_team
    and coalesce(c.status, '') <> 'firmado'
  order by p.full_name
  ```
- Para mandar contratos hace falta el correo del peregrino (`pilgrims.email`); si falta, decilo.

## Plata del camino y proveedores

- Resumen financiero de cada camino: `v_departure_finance` (ingreso esperado, recaudado,
  pendiente, costo, utilidad, `por_devolver_eur`, `fx_difference_eur`...). Global:
  `v_financial_global`.
- **Falta por pagar a proveedores:** `v_departure_payable.falta_por_pagar_eur` (por camino) y,
  reserva por reserva, `v_pending_payments` (`saldo_eur`, `next_due_date`,
  `next_due_amount_eur`). Pagos ya hechos: `provider_payments`.
- Reservas (`reservations`): hoteles, cenas, transporte. `status`: presupuestado | enviado |
  reservado | pagado. Proveedor en `providers`. Habitaciones: `v_rooming_list`. Cenas y menú
  elegido: `v_menu_choices`, `v_dinner_reservations`.
- Gastos: `expenses` (`kind` operativo | personal) y la vista unificada `v_all_movements`.
  Saldos por cuenta: `v_account_balances`.
- TRM: `trm_rates` (EUR→COP por fecha).

## Quién hizo qué

- **`audit_log`**: cada insert/update/delete en las tablas del negocio desde el 15-oct-2026.
  `user_name` (quién), `actor` (`equipo` | `sistema`; sistema = algo que hizo un peregrino
  desde su enlace o un proceso automático), `table_name`, `op`, `row_id`, `changed` (columnas
  que cambiaron), `old`/`new` (solo lo que cambió). Para "¿quién registró el pago de X?":
  buscá en `audit_log` con `table_name = 'pilgrim_payments'` y `row_id = <id del pago>`. Lo
  anterior al 15-oct-2026 no tiene autor: se hacía con una cuenta compartida.
- `assistant_messages`: lo que cada quien le ha preguntado al asistente.
- `profiles`: el equipo (`full_name`, `app_role`). No muestres la columna `cedula`.

## Enlaces a la plataforma

Cuando ayude, poné el enlace en markdown, relativo. **Un enlace necesita el id real**: traé
`d.id` / `p.id` en la misma consulta. Nunca armes una ruta sin id (`/caminos?tab=contratos` no
lleva a ningún camino).
- Camino: `/caminos/<departure_id>` y sus pestañas con `?tab=` resumen, pagos, liquidacion,
  peregrinos, contratos, presupuesto, viaticos, reservas, habitaciones, cenas, gastos,
  documento, videos.
- Peregrino: `/peregrinos/<pilgrim_id>`.
- Otros: `/pagos` (cobros a peregrinos), `/pagos-proveedores`, `/proveedores`, `/gastos`,
  `/trm`, `/actividad` (quién hizo qué).
