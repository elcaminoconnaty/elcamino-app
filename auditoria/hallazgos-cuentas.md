# Auditoría de cuentas — elcamino-app

Fecha: 2026-09-29 · Base: Supabase `btunvfrxegjwpznlmvjp` (solo SELECT) · Código: sin tocar.

## Resumen

La **matemática por peregrino está bien**: recalculé de forma independiente las 30 inscripciones
(neto, pagado histórico, acreditado a tasa de cierre, penalidad, devoluciones, saldo final) y
coinciden al centavo con `v_pilgrim_settlement`. Los `amount_eur` guardados de los 81 movimientos
(peregrinos, proveedores, gastos) coinciden con `amount / trm` o `amount × usd_eur_rate`.

El problema es que **no hay una sola verdad por concepto**. Hay tres familias de cifras que la app
mezcla en la misma pantalla:

1. **Saldo de peregrinos**: hay un saldo "histórico" (tasa del día de cada abono) y otro "liquidado"
   (con la tasa de cierre). Algunas pantallas usan el primero cuando ya existe el segundo. En Sep 2026
   esto hace que la ficha del peregrino y la pestaña Resumen digan que faltan **1.103,05 €** cuando en
   realidad falta **0 €**, y hay que devolver 5 €.
2. **Costo del camino**: `v_departure_finance.costo_total_eur` / `v_departure_payable` es un **modelo**
   (costo por cama × inscritos × (1 + contingencia)). No es lo que se contrató con los proveedores. En
   Abr 2027 el modelo dice 10.953,13 € en reservas, pero los contratos suman **16.830,00 €**: la utilidad
   proyectada sale inflada en **5.876,88 €**. En Sep 2026 el modelo infla las reservas en +612,37 €.
   Además, la tabla de reservas de la misma pestaña muestra el costo real, así que el total de arriba no
   cuadra con la suma de las filas.
3. **Pesos colombianos (COP)**: `EurCop` siempre calcula EUR × la TRM elegida (la última TRM o la
   editada con TrmSelector). Nunca muestra los pesos que de verdad se pagaron ni el saldo en pesos a la
   tasa de cierre. En la misma ficha salen dos cifras en COP distintas para el mismo saldo.

Además hay alertas falsas de "Pago VENCIDO" por 4.795 € en Sep 2026 (las cuotas del proveedor nunca se
marcaron pagadas) y un **peregrino de prueba** que suma 2.790 € al esperado de Abr 2027.

| Severidad | Cantidad |
|---|---|
| CRÍTICO | 6 |
| ALTO | 9 |
| MEDIO | 10 |
| BAJO | 8 |

### Mapa: qué pantalla usa qué fuente (resumen)

| Concepto | Dónde se calcula | Quién lo usa | ¿Coincide? |
|---|---|---|---|
| Esperado por camino | `v_departure_finance.expected_revenue_eur` (neto + penalidades, sin equipo ni cancelados) | panorama, Pagos, Resumen, `v_financial_global` | Sí. `v_departure_summary` repite la misma fórmula. Ojo: la columna "Total" por peregrino **no** incluye la penalidad (+100 € de diferencia en Abr 2027). |
| Cobrado | `v_departure_finance.collected_revenue_eur` (histórico, sin equipo, **con** cancelados) · `v_departure_summary.collected_revenue_eur` (histórico, **con** equipo y cancelados) · `v_financial_global.collected_eur` (todo) | panorama/Pagos · caminos/dashboard Naty · Naty/Gastos | Hoy dan lo mismo (el equipo no pagó nada), pero son tres fórmulas distintas |
| Falta por cobrar | `pending_revenue_eur` (histórico) vs `pending_settled_eur` / `por_cobrar_eur` (liquidado) | panorama y Pagos → liquidado · **Resumen, ficha del peregrino (PaymentSummary), reporte histórico → histórico** | **NO** (C-1, C-2) |
| Pagado por peregrino | `paid_eur_historico` (incluye devoluciones y penalidades) | Pagos, Peregrinos, Excel "entró en caja", Liquidación "Euros que entraron" | Rotulado como "caja", pero incluye la penalidad (M-4) |
| Costo total | `v_departure_finance.costo_total_eur` = `v_departure_payable.total_modelo_eur` (modelo con contingencia) · `effectiveLineTotal` en TS (sin contingencia) · `v_departure_summary.estimated_cost_eur` (sin confirmados) · `compute_departure_scenario` SQL (sin contingencia) · costo real de las reservas | panorama/Pagos/Resumen · Presupuesto (subtotales), donut, CostBreakdown · dashboard Nico · (no se usa) · tabla de reservas, informe de pagos, Gastos | **NO** (C-3, C-4, A-3) |
| Falta por pagar | `v_departure_payable.falta_por_pagar_eur` (modelo) vs `v_reservation_payments.saldo_eur` + ítems (real) | panorama, Pagos, Naty, Gastos (tarjeta) vs filas de Pagos, Gastos (lista), informe PDF/Excel de pagos | **NO** (C-4) |
| COP | `EurCop` = EUR × TRM de contexto · `saldo_final_cop` (tasa de cierre, SQL) · `pending_cop_reference` (última TRM, SQL) · `amount` real | casi todo · Liquidación/Peregrinos · Peregrinos/reporte · detalle de pagos | **NO** (A-1) |

---

## Hallazgos

### CRÍTICO

#### C-1 · La pestaña Resumen muestra un "Pendiente por cobrar" histórico que contradice el panorama de la misma página
- **Qué:** `ResumenTab` muestra `f.pending_revenue_eur`: el esperado menos lo cobrado a la tasa del día de cada abono. Justo arriba, el `MoneyPanorama` muestra "Falta (liquidado)" = `pending_settled_eur`.
- **Evidencia:** `components/departures/tabs/resumen-tab.tsx:45` vs `components/departures/money-panorama.tsx:31-32`.
  `select pending_revenue_eur, pending_settled_eur, por_devolver_eur, fx_difference_eur from v_departure_finance where departure_id='9c1a3bf2-…'` → **1103.05 / 0 / 5 / 1108.05**. El 1.103,05 es la diferencia en cambio (1.108,05) menos los 5 € por devolver: no es plata por cobrar.
- **Arreglo:** una sola columna para "falta por cobrar" en la vista. En `v_departure_finance`, dejar `pending_revenue_eur := pending_settled_eur` (o borrar `pending_revenue_eur`) y que Resumen, Pagos, el panorama y `v_financial_global` lean solo esa. `pending_settled_eur` ya cae al histórico cuando no hay tasa (verificado: en Abr 2027 da 29.066,04 = histórico).

#### C-2 · La ficha del peregrino ("Resumen de pagos") muestra un pendiente falso a quien ya liquidó o ya recibió su devolución
- **Qué:** `PaymentSummary` calcula `Pendiente EUR = totalEur − Σ amount_eur` (histórico) y el avance %. No usa la liquidación. Además suma todas las inscripciones, también las canceladas.
- **Evidencia:** `components/pilgrims/payment-summary.tsx:22-40,93-94`, llamado desde `app/(app)/peregrinos/[id]/page.tsx:489-493`. En Sep 2026 (liquidado con 3.896,8):

  | Peregrino (registration_id) | Muestra "Pendiente EUR" | Real (`saldo_final_eur`) |
  |---|---|---|
  | Santiago Botero (560ceb08) | **283,00** | 0 (ya se le **devolvieron** 283 €) |
  | Beatriz Garzón (7a780ba2) | 236,73 | 0 (devuelto 236,73) |
  | Laura Lizcano (254ba120) | 199,92 | 0 |
  | Yesica Herrera (aeff4adc) | 153,81 | 0 |
  | Patricia Madriz (28ed4bdb) | 121,93 | 0 |
  | Deicy Moreno (bf5e0575) | 93,99 | 0 (devuelto 92,90) |
  | Ximena Ramírez (c960ca77) | 87,21 | 0 |
  | Elcy Calle (416dbfbc) | −68,54 | 0 |

  En la misma página, la tarjeta de la inscripción (líneas 331-343) sí dice "Pendiente 0". La página se contradice.
- **Arreglo:** que `PaymentSummary` reciba `saldo_final_eur`, `por_cobrar_eur`, `por_devolver_eur` y `paid_eur_cierre` de `v_pilgrim_settlement`, sumados solo sobre las inscripciones no canceladas. El % de avance debe ser `paid_eur_cierre / net_total_eur`. Única fuente: `v_pilgrim_settlement`.

#### C-3 · El costo total del camino (y la utilidad) no es el costo contratado; en Abr 2027 la utilidad sale inflada en 5.876,88 €
- **Qué:** el trigger `sync_budget_item_from_reservation` convierte cada reserva de alojamiento, cena o transporte por persona en un ítem `por_inscrito`, con costo unitario = costo de la reserva ÷ `beds_count`. Después, `v_departure_finance` y `v_budget_payable` lo multiplican por (pagantes + equipo) × (1 + contingencia %). Resultado: el costo cambia con el número de inscritos aunque el contrato sea fijo. Las camas reservadas y no ocupadas desaparecen del costo, y la contingencia se aplica encima de reservas ya **pagadas** con monto exacto.
- **Evidencia (por departure):**
  ```sql
  -- costo real reservas (confirmed/estimated) vs línea del modelo
  Sep 2026 (9c1a3bf2): real 11251.50 · modelo 11863.87  → +612.37
  Abr 2027 (39fc6fa6): real 16830.00 · modelo 10953.13  → −5876.88
  ```
  Casos de Abr 2027: Arzúa 7f1fcab4 (real 2.869 / modelo 1.793,13), transporte 45e1e291 (24 personas: real 2.040 / modelo 1.275), cenas 3eaf182a (real 1.152 / modelo 720). Casos de Sep 2026: Santiago 490d99cf (13 camas, pagado 1.262,50, modelo 1.529,57) y Santiago 60c4b40e (pagado 1.433,50, modelo 1.505,18 por el 5 %).
  - `utilidad_total_eur` de Abr 2027 = 17.120,75. Con los costos contratados sería 34.242 − (16.830 + 6.168,13) = **11.243,87** (y 8.453,87 sin el peregrino de prueba, ver A-2).
  - `PerPilgrimCostCard` (`components/departures/per-pilgrim-cost-card.tsx:183-187`) dice "⚠ De ese total, desperdicio en camas vacías 5.111,88 €", pero ese desperdicio **no está** en el total.
- **Arreglo:** para los ítems con `reservation_id`, que la línea del presupuesto sea el costo de la reserva: `coalesce(r.confirmed_cost_eur, r.estimated_cost_eur)` (fijo), sin escalar por inscritos y sin contingencia. Hay que cambiarlo en `v_budget_payable.line_total_eur` y en `v_departure_finance.costs`, idealmente con una sola vista `v_budget_line` que usen las dos. El modelo por inscrito debe quedar solo para ítems sin reserva, y el simulador de escenarios puede seguir usándolo. Única fuente del costo: `v_budget_line` (con reservas = contrato).

#### C-4 · "Falta por pagar" a proveedores: la tarjeta y la lista de la misma pantalla no cuadran
- **Qué:** la tarjeta (panorama, pestaña Pagos, dashboard de Naty, tarjeta de /gastos) usa `v_departure_payable.falta_por_pagar_eur`, que sale del modelo. Las filas de la pestaña Pagos, la lista "Pendiente por pagar a proveedores" de /gastos y el informe PDF/Excel de pagos usan `v_reservation_payments.saldo_eur`, que sale del contrato.
- **Evidencia:** Sep 2026: tarjeta **10.647,87**; filas = reservas 6.438,00 + ítems sin reserva 3.615,00 = **10.053,00** (diferencia 594,87). El modelo deja "saldos fantasma" en reservas **ya pagadas**: Santiago 490d99cf 267,07; Santiago 60c4b40e 71,68; Sarria 63ad8690 31,50; Palas bc26a05b 24,75. Global en /gastos: tarjeta 27.769,12 vs lista 23.268 + 9.783,13 = 33.051,13. El comentario de `app/(app)/gastos/page.tsx:49-50` ("Junto con `pq` cubren el total") es falso. Archivos: `components/departures/money-panorama.tsx:41-44`, `components/departures/tabs/pagos-tab.tsx:50-52`, `app/(app)/gastos/page.tsx:95`, `app/(app)/dashboard/naty/page.tsx:37-38`, `lib/pagos-pendientes/datos.ts:193-270`.
- **Arreglo:** se resuelve con C-3. `v_departure_payable` debe salir de las mismas líneas que el informe de pagos: Σ `v_reservation_payments.saldo_eur` + Σ `v_budget_payable.saldo_eur` (sin reserva). Única fuente: `v_budget_line`/`v_budget_payable` con la línea de reserva = contrato.

#### C-5 · Alertas falsas de "Pago VENCIDO" a proveedores por 4.795 € en reservas ya pagadas
- **Qué:** `CriticalAlertsBanner` lee `v_reservation_schedule` con `paid=false`. Las cuotas solo se marcan pagadas si el pago se registra desde el diálogo con plan (`markScheduleItemPaid`). Los pagos registrados de otra forma dejan la cuota abierta para siempre. Además, el plan no se valida contra el costo.
- **Evidencia:** `components/departures/critical-alerts-banner.tsx:53-58,188-207`.
  ```
  60c4b40e Santiago  vence 2026-08-27  1990 € (¡el costo es 1433,50!)  saldo real 0
  63ad8690 Sarria    vence 2026-09-14  1080 €                           saldo real 0
  490d99cf Santiago  vence 2026-09-15  1230 € (costo 1262,50)           saldo real 0
  f20b9d9f Palas     vence 2026-09-15   495 €                           saldo real 0
  ```
  La portomarín ea32d81d tiene un plan de 504 € y un costo de 528 €.
- **Arreglo:** que el estado de la cuota se **derive** de los pagos, con la misma lógica de "cascada" de `v_installment_status` para peregrinos: `v_reservation_schedule.paid_eur/remaining_eur` = asignar Σ `provider_payments` de la reserva a las cuotas por orden de vencimiento. Así se deja de depender del booleano `paid`. Alerta solo si `remaining_eur > 0.01`. Validar que Σ cuotas = costo de la reserva.

#### C-6 · El % de contingencia y la fórmula por pagante difieren entre SQL y TS: dos "costo por pagante" y dos "utilidad por pagante" en la misma pestaña Resumen
- **Qué:** `effectiveLineTotal` (`lib/finance.ts:54-71`) no aplica `variable_buffer_pct` y multiplica `por_pagante` por pagantes + equipo. `v_departure_finance` aplica la contingencia y multiplica `por_pagante` solo por pagantes. `CostBreakdownCard` rearma el costo por pagante sin contingencia. El comentario de la línea 53 ("debe coincidir con v_departure_finance") no se cumple.
- **Evidencia (Sep 2026, contingencia 5 %):**
  - KPI "Costo total proyectado" 19.545,89 vs suma de subtotales de Presupuesto y del donut 18.920,56 (la tarjeta "Total presupuesto" de `presupuesto-tab.tsx:29` no es la suma de las cuatro tarjetas de al lado).
  - KPI "costo por pagante" 1.503,53 vs `CostBreakdownCard` 1.455,43. "Utilidad por pagante" 948,93 vs 997,04 (`components/departures/cost-breakdown-card.tsx:13-21`).
  - `compute_departure_scenario` (SQL) tampoco aplica la contingencia. `simulateScenario` (TS) sí.
- **Arreglo:** que la vista exponga `line_total_eur` por ítem (la `v_budget_line` de C-3) y que TS **no** recalcule: Presupuesto, donut y CostBreakdown deben sumar esas líneas. Borrar `compute_departure_scenario` o alinearla. Decidir una sola regla para `por_pagante` (¿lo consume el equipo?) y escribirla en un solo lugar.

### ALTO

#### A-1 · Los COP que muestra `EurCop` no son los pesos reales: dependen de la TRM de contexto y del TrmSelector
- **Qué:** `EurCop` = `eur × trm` (`components/ui/eur-cop.tsx:26-38`). En el layout general, la TRM es la **última** (3.586 del 2026-09-17, `app/(app)/layout.tsx:36-43`). En la página del camino es la tasa de cierre o, si no hay, la última (`caminos/[id]/page.tsx:70`). El TrmSelector la cambia en el cliente sin avisar en cada cifra.
- **Evidencia:**
  - Ficha de Santiago Botero: "Abonado 2.246,00 € · COP 8.054.156" (2.246 × 3.586). Pagó en realidad 10.957.771 COP y se le devolvieron 1.102.794 (neto 9.854.977 COP). La pestaña Liquidación muestra el saldo en COP a 3.896,8 (`saldo_final_cop`). La ficha lo muestra a 3.586. Son dos COP distintos para el mismo saldo.
  - Cuenta "Bancolombia Camino": `saldo_eur` 20.283,05 → EurCop muestra 72.735.017 COP. Los pesos reales que movió la cuenta son 89.489.257 − 15.000.000 = **74.489.257 COP**, y además hay 2.562 € en EUR registrados en esa cuenta (ver B-5).
  - En la página del camino, cambiar el TrmSelector cambia la "utilidad en COP", los saldos, etc. No hay ninguna marca de que la cifra en COP es simulada.
- **Arreglo:** (1) Para saldos de peregrinos, mostrar en COP **solo** `saldo_final_cop` / `por_cobrar_cop` / `por_devolver_cop` de `v_pilgrim_settlement`. Cuando no hay tasa de cierre, mostrar `pending_cop_reference` rotulado "referencia TRM hoy". (2) Para pagado y cuentas, mostrar la suma de `amount` en COP (`v_account_currency_breakdown.monto_origen`), no EUR × TRM. (3) Dejar `EurCop` solo para cifras de modelo (costos y utilidad), rotulado "≈ a TRM X", y que el TrmSelector muestre el aviso de simulación en cada valor.

#### A-2 · Hay un "Peregrino de prueba" como inscrito pagante en Abr 2027
- **Evidencia:** registration `318e7458-d33e-4299-9ae8-33cbb9393c1b`, pilgrim "Peregrino de prueba" (email de Nicolás), status `inscrito`, total 2.790 €. Suma 2.790 al esperado (34.242) y al pendiente (29.066,04 en /pagos y en el dashboard de Naty), cuenta como pagante (13 → en realidad 12), sube el precio promedio (2.634) y cambia las camas esperadas.
- **Arreglo:** borrarlo o cancelarlo (lo decide el dueño). A futuro: una marca `is_test` en pilgrims y un filtro en todas las vistas.

#### A-3 · Tres "costos" distintos del mismo camino en tres pantallas
- **Evidencia:** Sep 2026: `v_departure_finance.costo_total_eur` 19.545,89 (panorama, Resumen, Naty); `v_departure_summary.estimated_cost_eur` 19.544,87 (**dashboard de Nico**, `app/(app)/dashboard/nico/page.tsx:73`, ignora lo confirmado); `effectiveLineTotal` 18.920,56 (Presupuesto/donut). El dashboard de Nico también lista las reservas con `estimated_cost_eur` en vez de confirmado (`nico/page.tsx:21,101`).
- **Arreglo:** que todas lean el costo de `v_departure_finance` (ya corregido por C-3). Borrar `estimated_cost_eur` de `v_departure_summary` o renombrarlo como "estimado inicial".

#### A-4 · El panorama cuenta "inscritos" de una forma y el celular, la lista de caminos y el dashboard de Nico de otra (13/15 vs 15/15)
- **Qué:** `inscritos_total = pagantes_count + team_count` (inscripciones no canceladas, **con** equipo): Sep 2026 = 13 + 2 = 15. El panorama de escritorio y Resumen muestran `pagantes/capacity` = 13/15 + 2 equipo. El resumen del celular (`caminos/[id]/page.tsx:136`) muestra `inscritos_total/capacity` = **15/15**. `/caminos` y el dashboard de Nico muestran `v_departure_summary.pilgrims_count` (también con equipo) / capacity.
- **Cuál es el correcto:** el que usa **pagantes**. `computeBreakEven` compara pagantes contra `capacity` (`lib/finance.ts:83`), y en Abr 2027 hay 22 de capacidad y 24 camas reservadas (22 + 2 del equipo), o sea que la capacidad es el cupo de peregrinos. Con 15/15 parece que el camino está lleno cuando quedan 2 cupos. Conviene que el dueño lo confirme.
- **Arreglo:** documentar `departures.capacity` = cupo de pagantes. Agregar `cupo_libre = capacity − pagantes_count` en `v_departure_finance`. En el celular, `/caminos` y el dashboard de Nico mostrar `pagantes_count/capacity (+ equipo)`. Borrar `pilgrims_count` de `v_departure_summary` o hacerlo igual a `pagantes_count`.

#### A-5 · La utilidad proyectada no refleja la diferencia en cambio absorbida
- **Qué:** `utilidad_total_eur = expected − costo`. Con recálculo, a los peregrinos se les acreditaron 1.108,05 € más de lo que valían sus pesos a la tasa de cada abono (Sep 2026). El panorama muestra "Esperado 31.882 / Cobrado 30.778,95 / Falta 0", que no suma, y la utilidad sigue con el esperado completo. Mientras tanto, la "Plata disponible" (`v_financial_global.cash_available_eur`) usa el histórico.
- **Arreglo:** elegir una sola valoración. La propuesta es que "Cobrado" sea el **acreditado** (Σ `paid_eur_cierre`, sin equipo) cuando hay tasa de cierre, para que Esperado = Cobrado + Falta − Por devolver. Mostrar aparte "Caja histórica" y "Dif. en cambio". En la utilidad, mostrar "utilidad sobre caja" = esperado − fx_difference − costo junto a la proyectada.

#### A-6 · El dashboard de Naty puede volver al pendiente histórico y mostrar la diferencia en cambio como plata por entrar
- **Qué:** `hayLiquidacion = pending_settled > 0 || por_devolver > 0.5`. Si no, usa `pending_revenue_eur` (`app/(app)/dashboard/naty/page.tsx:49-54`). Hoy da bien por casualidad, porque Abr 2027 tiene saldo. Cuando todos paguen, el dashboard va a mostrar los 1.103,05 € de Sep 2026 como "Pendiente por entrar".
- **Arreglo:** usar siempre `pending_settled_eur` (ver C-1).

#### A-7 · Los cancelados con saldo a favor no aparecen en "Por devolver", pero su plata sí cuenta como cobrada
- **Qué:** `v_departure_finance.settlement` y la pestaña Liquidación filtran `status <> 'cancelado'`. `collected_revenue_eur` sí suma los pagos de cancelados. Si un cancelado tiene derecho a reembolso (`refund_status` distinto de `sin_reembolso`), su devolución pendiente no aparece en ningún total. Hoy no hay cancelados, así que es latente.
- **Arreglo:** en `v_departure_finance`, sumar `por_devolver_eur` de los cancelados con `refund_status = 'pendiente'` (o equivalente) en una columna `por_devolver_cancelados_eur`, y mostrarla.

#### A-8 · El plan de cuotas del proveedor y el informe de pagos pueden pedir girar más de lo que se debe
- **Qué:** `armarInformePagos` lista cada cuota impaga completa. Si Σ cuotas > saldo, solo agrega un aviso (`lib/pagos-pendientes/datos.ts:248-262`) y el giro sale por el monto de la cuota. Ej.: Santiago 60c4b40e tiene una cuota de 1.990 € para un costo de 1.433,50 €. Hoy no sale en el informe porque el saldo es 0, pero con saldo > 0 se pediría girar la cuota completa.
- **Arreglo:** que la cuota a girar sea `min(cuota, saldo restante)` en cascada (misma vista derivada de C-5).

#### A-9 · Los pagos a proveedores sin reserva ni ítem no bajan el "falta por pagar"
- **Qué:** `v_budget_payable` solo cuenta los `provider_payments` con `reservation_id`, o con `budget_item_id` y sin reserva. Un pago suelto (solo `departure_id`) suma en `v_departure_summary.paid_to_providers_eur` y en `v_financial_global`, pero no descuenta nada. Hoy hay 0 casos (verificado), así que es latente. Igual con una reserva sin budget_item (el trigger siempre lo crea, pero `auto_link_orphan_budget_items` y los deletes podrían romperlo).
- **Arreglo:** constraint `CHECK (reservation_id IS NOT NULL OR budget_item_id IS NOT NULL)` en `provider_payments`, o una fila "sin asignar" en `v_departure_payable`.

### MEDIO

#### M-1 · Dos columnas de la misma fila en Pagos y Peregrinos usan bases distintas
- `pagos-tab.tsx:123-133`: "Total 2.529 · Pagado 2.292,27 · Falta *al día*" (Beatriz). "Pagado" es el histórico y "Falta" el liquidado, así que la fila no cierra. `peregrinos-tab.tsx:103-109` lo resuelve con una columna "Acreditado"; Pagos no la tiene.
- **Arreglo:** en Pagos, mostrar `paid_eur_cierre` como "Acreditado" cuando hay tasa (igual que Peregrinos).

#### M-2 · "Esperado" incluye la penalidad, pero el "Total" por peregrino no
- `v_departure_finance.expected_revenue_eur` = neto + penalidades (Abr 2027: 34.142 + 100 = 34.242). Las tablas de Pagos, Peregrinos y Liquidación muestran `net_total_eur` (sin la penalidad) y la penalidad resta del pagado. Los dos criterios dan el mismo saldo, pero la suma de la columna "Total" (34.142) no es el "Esperado" del encabezado (34.242).
- **Arreglo:** dado que se decidió que la penalidad es un movimiento negativo, que `expected_revenue_eur` = Σ `net_total_eur` y que "Cobrado" (el acreditado) incluya la penalidad como negativo. Así los encabezados suman lo que muestran las filas.

#### M-3 · El "Cobrado" tiene tres fórmulas (con o sin equipo, con o sin cancelados)
- `v_departure_finance.collected_revenue_eur` (sin equipo, con cancelados) · `v_departure_summary.collected_revenue_eur` (con equipo y cancelados) · `v_financial_global.collected_eur` (todo). Hoy coinciden (30.778,95 / 5.175,96).
- **Arreglo:** que `v_departure_summary` y `v_financial_global` lean de `v_departure_finance`.

#### M-4 · "Euros que entraron" / "Pagado EUR (entró en caja)" incluye las penalidades, que no son caja
- `paid_eur_historico` suma `amount_eur` de **todos** los movimientos, penalidades incluidas. Claudia Leal (67259ad2): muestra 1.337,55, pero entraron 1.437,55. Afecta a `liquidacion-tab.tsx:48,93`, `app/api/export/peregrinos/route.ts:22,57`, la columna "Pagado" de Pagos y Peregrinos y el comentario de `lib/settlement.ts:93`.
- **Arreglo:** agregar `caja_eur` (sin penalidad) a `v_pilgrim_settlement` y usarla donde el rótulo dice "entró/caja". Dejar `paid_eur_historico` como "abonado neto de penalidades".

#### M-5 · Las fechas por defecto usan UTC: después de las 19:00 hora de Colombia se registra el día siguiente, y con él la TRM de ese día
- `new Date().toISOString().slice(0,10)` en `new-payment-dialog.tsx:30`, `closing-payment-dialog.tsx:43`, `new-penalty-dialog.tsx:25`, `register-reservation-payment.tsx:33`, `new-expense-dialog.tsx:47`, `lib/actions/expenses.ts:14`, `lib/actions/reservations.ts:211`, `freeze-trm-banner.tsx:34`, `lib/pagos-pendientes/datos.ts:139` (el "vencida" del informe se calcula con la fecha UTC del servidor). `getTrmForDate(paidAt)` busca entonces la TRM de mañana si existe.
- **Arreglo:** un helper `hoyBogota()` (`Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'})`) en `lib/utils.ts`, usado en todos estos lugares.

#### M-6 · En la pestaña Viáticos, "Total viáticos" no filtra los cancelados y "÷ 2" está fijo en el código
- `viaticos-tab.tsx:12-18,28-34`: la consulta no tiene `.neq("status","cancelado")`, a diferencia de `v_departure_finance`. `perTeam = total / 2` ignora `team_count`. Hoy no hay viáticos cancelados (verificado), así que es latente.
- **Arreglo:** filtrar los cancelados y dividir por `f.team_count`. Mejor aún: leer `viatico_team_eur` de la vista.

#### M-7 · El saldo en EUR de las cuentas en COP es costo histórico, no valor actual
- `v_account_balances.saldo_eur` de "Bancolombia Camino" = 20.283,05 € (Σ `amount_eur` a las tasas de cada día). Los pesos reales (74,49 M COP) valen 20.772 € a la TRM de hoy. Con varias cuentas en COP, "Plata disponible" no es plata disponible.
- **Arreglo:** que `v_account_balances` exponga el saldo en moneda origen por cuenta (Σ `amount` por moneda) y que el valor en EUR "hoy" se calcule con una TRM explícita y rotulada.

#### M-8 · El % de cuotas pagadas usa otra tolerancia
- `v_installment_status` marca "pagada" con una diferencia ≤ **1,0 €**. La liquidación usa **0,5 €** (`TOLERANCIA_EUR`).
- **Arreglo:** usar 0,5 en la vista, o poner la tolerancia en una sola función SQL.

#### M-9 · La página /gastos mezcla alcances cuando se filtra por camino
- Con `?departure_id=`, "Pendiente por pagar" y los movimientos se filtran, pero "Ingresado", "Pagado proveedores", "Utilidad realizada" y "Caja disponible" siguen siendo globales (`app/(app)/gastos/page.tsx:103-109`).
- **Arreglo:** en modo filtrado, leer esas cifras de `v_departure_finance` y de los movimientos del camino, o rotularlas "global".

#### M-10 · Pagos y devoluciones pasan de "caja" a "acreditado" sin rótulo en los recibos viejos
- El recibo PDF (`components/pdf/recibo-pago.tsx:131-186`) muestra siempre el **estado de hoy** del viaje, no el de la fecha del pago. Si se reimprime el recibo de un abono de marzo, sale con el saldo de septiembre y la tasa de cierre.
- **Arreglo:** rotular "Estado del viaje al {hoy}", o calcular el saldo acumulado hasta `paid_at` de ese pago.

### BAJO

- **B-1 · Columna muerta `registrations.penalty_eur`:** todas en 0 y ninguna vista ni componente la usa (verificado con grep). Borrarla para que nadie la llene pensando que cuenta.
- **B-2 · Sumas en float en TS y Excel sin redondear:** `reduce((s,x)=>s+Number(x))` en `app/api/export/peregrinos/route.ts:21-29`, `liquidacion-tab.tsx:44-48` y `pagos-proveedores/page.tsx:73,126`. En pantalla se tapa con `formatEUR`, pero en el Excel pueden quedar valores como 2292.2700000000004. Redondear a 2 decimales (`Math.round(x*100)/100`) antes de escribir la celda, o sumar en SQL.
- **B-3 · COP de la liquidación agregada no redondeado por persona:** `liquidacion-tab.tsx:91-92` calcula `formatCOP(porCobrar * trm)` sobre el total, mientras que cada fila usa `round(saldo × trm)`. La suma de las filas puede diferir en pesos. Sumar `por_cobrar_cop`/`por_devolver_cop` de la vista.
- **B-4 · Comisiones registradas como pago al proveedor:** `provider_payments` 235da422 y 04cb5d78 (0,95 € cada uno, "Wise" desde "Efectivo" y transferencia). Dejan Sarria 63ad8690 sobrepagada (1.102,50 vs 1.080) y el `GREATEST(0, …)` esconde el exceso. Registrarlas como gasto operativo y mostrar un aviso cuando `paid > cost`.
- **B-5 · Movimientos en EUR asignados a una cuenta en COP:** pagos de cierre en EUR de Jose Resendiz (0a54ab62) y Ramiro Ríos (43953bff), 1.281 € cada uno, con método "Otro" y cuenta "Bancolombia Camino". Descuadran el saldo por moneda de esa cuenta. Además, "Bancolombia Naty" queda en −2.040,88 € por un retiro personal de 10 M COP con solo 1,1 M COP de entrada. Revisar con Naty.
- **B-6 · Método vs cuenta incoherentes:** Luz Helena (0926051a): método "Bancolombia", cuenta "Global 66". La regla de revalorización mira el **método** (`payment_fx_recalc`). Un COP con cuenta Global 66 y método Bancolombia se revalorizaría por error. Validar en `assertGlobal66Rate` que cuenta = Global 66 ⇔ método = Global 66.
- **B-7 · El Excel general de peregrinos omite a los eliminados:** `app/api/export/peregrinos/route.ts:9` filtra `deleted_at is null`, así que los abonos retenidos de los eliminados no aparecen, aunque sí suman al "Cobrado".
- **B-8 · Diana Tobón (4f1eb23f) tiene 5 € por devolver sin registrar:** está pendiente, no es un error de cálculo. Hacer la devolución o anotar que se retiene.

---

## Verificado correcto

- **`v_pilgrim_settlement` / `v_pilgrim_payment_settlement`:** recalculé las 30 inscripciones desde cero (neto, histórico, acreditado a tasa de cierre con `round(amount/trm,2)` solo si `payment_fx_recalc`, penalidad, devuelto, saldo final). **0 diferencias.** Σ por cobrar = 29.066,04 y Σ por devolver = 5,00, que coinciden con `v_financial_global.pending_settled_eur` y `por_devolver_eur`.
- **`amount_eur` de los 81 movimientos** (54 de peregrinos, 8 de proveedores, 2 gastos): coinciden con `compute_payment_eur`. No hay `amount_eur` en NULL. Todas las devoluciones y penalidades son negativas y todos los abonos y cierres, positivos.
- **Tasa de cierre:** `v_registration_settlement_rate` usa la tasa del peregrino si existe (Laura 254ba120 y Ximena c960ca77, iguales a la de la salida) y si no, la de la salida. Solo en modo `recalculo`. Los pagos de cierre y devolución en COP guardan `trm_eur_cop` = 3.896,8, así que su diferencia en cambio es 0.
- **Penalidad como movimiento negativo:** se resta de `paid_eur_*`, no se revaloriza (`fx_recalc=false` forzado por el trigger), no pasa por ninguna cuenta (`v_account_balances` la excluye) y el saldo es igual que si se sumara al precio (Claudia: 2.529 − 1.337,55 = 1.191,45).
- **Signos en `registerRefund` / `updatePilgrimPayment` / `createPenaltyMovement`:** el servidor fuerza el signo según `kind`. El tope de devolución usa `por_devolver_eur + 0,5`.
- **Esperado por camino:** Sep 2026 Σ neto = 31.882 ✓. Abr 2027 34.142 + 100 de penalidad = 34.242 ✓. Cobrado: 30.778,95 y 5.175,96 ✓.
- **Equipo:** Nathalia y Nicolás (`is_team`) están excluidos del esperado, del cobrado (finance), de la liquidación y del precio promedio. Tienen total 0 y ningún pago.
- **Eliminados:** 0 inscripciones de peregrinos eliminados. El borrado cancela la inscripción con `sin_reembolso`, así que queda coherente con los filtros por `status`.
- **Cancelados:** 0 hoy. Las vistas los filtran de forma consistente (salvo A-7).
- **`v_departure_finance.costo_total_eur` = `v_departure_payable.total_modelo_eur`** (19.545,89 / 17.121,25). `pagado_real_eur` 8.903,02 = pagos a proveedores 4.836,00 + gasto vinculado 4.067,02 ✓.
- **`v_account_balances`:** ingresos sin penalidad, con devoluciones en negativo. La suma por cuenta cuadra con los movimientos.
- **`v_financial_global`:** collected 35.954,91 = 30.778,95 + 5.175,96 ✓. cash_available 24.753,04 = 35.954,91 − 4.836 − 4.067,02 − 2.298,85 ✓.
- **Informe de pagos por giro** (`lib/pagos-pendientes/datos.ts`): agrupa por reserva y cuota, salta los saldos en 0 y suma los ítems sin reserva de `v_budget_payable`. Es coherente con el costo real (el problema es la tarjeta del modelo, C-4).
- **NULLs:** todas las vistas usan `coalesce` en sumas y joins. `net_total_eur` no puede ser NULL (`total_eur` y `discount_eur` son NOT NULL con default 0).
