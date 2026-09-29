# Revisión del diff `main...auditoria-2026-09-29` (commit 2924405)

Revisión de corrección (no de estilo) del WIP de la auditoría, antes de publicar. 2026-09-29.
Solo lectura: no se editó código ni se escribió en la base (solo SELECT).

## Resumen

| Severidad | Cantidad |
|---|---|
| BLOCKER | 0 |
| MAJOR | 1 |
| MINOR | 8 |

- `npx tsc --noEmit`: **pasa** (0 errores).
- `npx next lint`: **pasa** (solo warnings: variables sin usar en `edit-payment-dialog.tsx:29`, `new-payment-dialog.tsx:20,36`, `step-basicos.tsx:18` y `<img>`; ninguno es un bug).
- No se corrió `next build` (pedido: solo lint). Queda pendiente confirmar con build que el
  `/// <reference types="react-dom/canary" />` antes de `"use client"` en
  `components/ui/submit-button.tsx:1` no rompe la detección de la directiva (según las reglas de
  SWC un comentario antes de la directiva es válido; tsc lo acepta).

## Lo que se verificó y está bien

- **`intentar()` / `exigir()`**: los 44+ llamadores de las acciones convertidas usan `exigir(await …)`
  o revisan `r.ok` (grep por cada nombre en `app/`, `components/`, `lib/`; ninguna ruta de `app/api`
  importa acciones). Ningún llamador trata el objeto como el valor viejo: los que usaban datos
  (`createReservation().id`, `createProvider().id`, `createProviderAccount()`, `publicarDocumentoDeViaje().url`,
  `enviarDocumentoAlGrupo()`, `enviarContratosMasivo().filas`, `getPassportUploadUrl()`, `extractPassportFromStorage()`,
  `urlDeSubidaDe*()`, `deletePassportsForDeparture().deleted`, `parseReservationEmail()`) los reciben
  por `exigir`, que devuelve los mismos campos + `ok`. Ninguna tabla tiene columnas `ok`/`error` que choquen
  con el spread (solo `email_log.error`, que no se devuelve).
- **`redirect()` dentro de `intentar`**: `isRedirectError`/`isNotFoundError` comparan el `digest`, así que
  se relanzan bien. En el cliente, Next 14.2.35 resuelve la promesa de una acción que redirige con
  `undefined` (`server-action-reducer.js`, `resolve(actionResult)`), por eso `FormAccion` y
  `NewPilgrimDialog` (`if (r && !r.ok)`) no fallan tras crear camino/peregrino.
- **`SubmitButton`/`useAccionUnica`/`FormAccion`**: todos los `SubmitButton` están dentro de un `<form action=…>`;
  `useFormStatus` suelta el `pending` al terminar la promesa, y el candado se libera en `finally`.
  No hay forma de que quede deshabilitado tras un error. Ningún envío se descarta salvo el
  segundo mientras corre el primero (que es lo buscado).
- **`deletePilgrim`**: la única FK RESTRICT hacia `registrations` es `contracts` (verificado en
  `pg_constraint`), y se revisa antes de borrar nada. `pilgrim_payments` es CASCADE; el camino sin
  modo `reembolsado` confirma que no hay abonos justo antes de borrar. Correcto.
- **`generarContrato`**: `contracts_vigente_idx` (único parcial por inscripción) impide dos vigentes,
  así que el nuevo `errVigente` de `.maybeSingle()` no puede dispararse con datos válidos (0 duplicados hoy).
  Todos los contratos existentes tienen sus 2 firmantes: el insert de firmantes nunca falló en silencio.
- **`sign.ts`**: las columnas de `contract_signers` (`ip`, `user_agent`, `geo` text, `consent_text`) existen y
  los dos contratos firmados tienen esa evidencia guardada; `geo` siempre es string. Un update que afecta
  0 filas (firma de la organizadora ya puesta) no devuelve error. Firmar no puede fallar donde antes funcionaba.
- **`aceptarSolicitud`**: `status='aceptada'` pasa el CHECK; RLS `is_team_member()` permite el update con retorno.
- **`pending_settled_eur`**: en `v_departure_finance` es Σ `por_cobrar_eur` de `v_pilgrim_settlement`, y sin tasa
  `saldo_final_eur = neto − pagado histórico` (con la penalidad restando igual que en `pending_revenue_eur`).
  Verificado con SQL: Francés Abril 2027 (sin tasa) → `pending_revenue_eur = pending_settled_eur = 29.066,04`;
  Portugués (sin tasa) → 0 = 0; Francés Sep 2026 (con tasa 3.896,8) → 1.103,05 histórico vs 0 liquidado
  (+5 € por devolver), que es justo la diferencia en cambio. No devuelve 0 para caminos sin liquidar.
  Única diferencia de fondo (deseada): el liquidado no compensa el sobrepago de uno con la deuda de otro.
- **`penalidad_eur`** en `v_pilgrim_balance` es **positiva** (`-Σ amount_eur_cierre` de las penalidades) y
  `paid_eur` es Σ `amount_eur` con la penalidad en negativo ⇒ `paid_eur + penalidad_eur` = plata que entró. Signo correcto
  (ver MINOR-4 por el caso COP).
- **`effectiveLineTotal`**: coincide con `v_departure_finance` (por_inscrito × (pagantes+equipo) × (1+cont.),
  por_pagante × pagantes × (1+cont.), fijo/viático × cantidad, cancelados fuera en todos los llamadores).
  `CostBreakdownCard` suma exactamente `costo_por_pagante_unitario_eur`.
- **`cuotasPendientes`**: `v_reservation_payments` tiene una fila por reserva (FROM reservations), así que ninguna
  cuota desaparece por falta de fila; la cascada nunca pide más que `saldo_eur`. Hoy no hay ninguna cuota
  marcada pagada que quede con restante (SQL).
- **Columnas**: todas las `.select` cambiadas existen (`v_departure_finance.variable_buffer_pct/pagantes_count/team_count/
  pending_settled_eur`, `v_reservation_schedule.reservation_status/days_until_due`, `v_reservation_payments.departure_id/paid_eur/saldo_eur/cost_eur`,
  `v_installment_status.id/scheduled_amount_eur`, `v_pilgrim_settlement.paid_eur_cierre/saldo_final_eur/penalidad_eur`,
  `v_departure_summary.departure_id`). `budget_items.status` es NOT NULL (el `.neq("status","cancelado")` de viáticos no pierde filas).
- **Teléfonos**: `numeroWhatsApp("3042714363") = 573042714363`, `("+52 4421579377") = 524421579377`,
  `("+57 300 123 4567") = 573001234567`; los mismos resultados sobre el valor ya normalizado. Fijos colombianos
  sin "+" (`6014567890`, `(604) 444 5555 ext 12`) se guardan tal cual; `+34`, `0034…`, `34 6…`, `+1`, `+44`, `+57 60x…` correctos.
- **`hoyBogota()`**: `Intl` `en-CA` + `America/Bogota` da `YYYY-MM-DD`. Ningún reemplazo compara contra
  `CURRENT_DATE` en SQL (ver MINOR-7 por la inconsistencia de noche entre vistas y JS).
- Imports de servidor en cliente: los únicos módulos nuevos importados desde componentes cliente son
  `lib/url.ts` y `lib/telefono.ts` (puros). `lib/data/inscritos.ts` (`server-only`) solo en páginas de servidor.

---

## MAJOR

### MAJOR-1 · Un pago a proveedor ya guardado se reporta como error ⇒ riesgo de pago duplicado
- **Archivo:** `lib/actions/reservations.ts:265-266` y `:277-278` (`createProviderPayment`).
- **Qué pasa:** después del `insert` en `provider_payments` (la plata ya quedó registrada), si falla marcar la cuota
  (`errCuota`) o pasar la reserva a `pagado` (`errEstado`), la acción hace `throw` ⇒ `intentar` devuelve
  `{ ok:false }`. Antes esos dos errores se ignoraban y el usuario veía "Pago registrado".
- **Escenario:** en `edit-reservation-dialog.tsx:272` (marcar reserva como pagada con "registrar pago") `exigir` lanza,
  el diálogo muestra "Error" y queda abierto con todo cargado; Naty vuelve a tocar "Guardar" ⇒ `updateReservation`,
  habitaciones, cronograma y **un segundo `createProviderPayment`** por el mismo monto. Igual en
  `register-reservation-payment.tsx:90` (el toast dice "Error", el listado de pagos no se refresca y el formulario no se
  limpia: un segundo "Registrar pago" duplica). El texto del error dice "quedó registrado", pero el título "Error" y el
  diálogo abierto invitan a reintentar. Es el caso exacto que la auditoría quería evitar (doble pago).
- **Arreglo:** no lanzar después de que el pago existe. Devolver éxito con aviso:
  ```ts
  let aviso: string | undefined;
  if (errCuota) aviso = `El pago quedó registrado, pero la cuota no quedó marcada: ${errCuota.message}`;
  …
  if (errEstado) aviso = `${aviso ? aviso + " " : ""}La reserva no se pudo pasar a "pagado": ${errEstado.message}`;
  …
  return { id: creado.id as string, aviso };
  ```
  y en `register-reservation-payment.tsx`, `new-provider-payment-dialog.tsx`, `new-expense-dialog.tsx` y
  `edit-reservation-dialog.tsx` leer `const r = exigir(await createProviderPayment(fd))` y mostrar
  `r.aviso` como toast de advertencia **después** de cerrar/refrescar (flujo de éxito). Mismo criterio que ya se usó en
  `menu-email`/`rooming-email`.

---

## MINOR

### MINOR-1 · El informe de giros ya no avisa cuando el plan de cuotas suma más que el costo
- **Archivo:** `lib/pagos-pendientes/datos.ts:268` (rama `resto < -0.01`) con `lib/pagos-pendientes/cuotas.ts:34`.
- **Qué pasa:** `cuotasPendientes` recorta cada restante al saldo real, así que `sumaCuotas ≤ saldo` siempre y la rama
  del aviso "el plan de cuotas suma X y el saldo es Y. Revisá el plan" es código muerto.
- **Escenario real:** la reserva `60c4b40e…` tiene plan de 1.990 € y costo 1.433,50 € (SQL); antes el informe avisaba,
  ahora no dice nada y el plan mal cargado queda oculto.
- **Arreglo:** calcular el aviso con la suma original: `const planTotal = (cuotas ?? []).filter(c => c.reservation_id === r.id).reduce((s,c)=>s+Number(c.amount_eur||0),0); if (planTotal > total + 0.01) avisos.push(...)`.

### MINOR-2 · `normalizarCelular` convierte un celular colombiano con "+" sin 57 en un número de Grecia
- **Archivo:** `lib/telefono.ts:49-53`.
- **Escenario:** alguien escribe `+3001234567` (pasa en formularios públicos). Se guarda `"+30 01234567"`
  (indicativo 30 = Grecia). Antes se guardaba `+3001234567` y a simple vista se veía el error; ahora parece un número
  griego válido. (WhatsApp da el mismo resultado malo en ambos casos.)
- **Arreglo:** dentro de `if (conIndicativo)`, antes de `separarIndicativo`:
  `if (esCelularColombiano(digitos)) return digitos;`.

### MINOR-3 · Extensiones con "+" se pegan al número
- **Archivo:** `lib/telefono.ts:49-53`.
- **Escenario:** `"+1 305 555 1234 ext 22"` se guarda `"+1 305555123422"`: la extensión queda fundida y el número
  queda inválido y sin forma de recuperarlo (antes se guardaba tal cual).
- **Arreglo:** si `crudo` tiene letras (`/[a-z]/i`) o `#`, devolver `crudo` sin normalizar.

### MINOR-4 · "Entró en caja" del Excel mezcla tasas si la penalidad es en pesos
- **Archivo:** `app/api/export/peregrinos/route.ts:27`.
- **Qué pasa:** `paid_eur` es Σ `amount_eur` (tasa del día) pero `penalidad_eur` es Σ `amount_eur_cierre` (tasa de cierre).
  Hoy la única penalidad es en EUR (`amount_eur = amount_eur_cierre`, verificado), así que el resultado es exacto; con una
  penalidad en COP en un camino liquidado la "caja" quedaría corrida por la diferencia en cambio de esa penalidad.
- **Arreglo:** sumar la caja directo de los movimientos: leer `pilgrim_payments(amount_eur, kind)` y sumar
  `kind <> 'penalidad'`, o exponer `paid_eur_historico` sin penalidad en la vista.

### MINOR-5 · Pagos: el encabezado "Acreditado/Pagado" no siempre coincide con lo que muestra la fila
- **Archivo:** `components/departures/tabs/pagos-tab.tsx:105` vs `:112,124`.
- **Qué pasa:** el encabezado usa `hayCierre` (tasa del camino + modo recálculo) y cada fila usa
  `r.settlement_trm != null` (incluye tasas de excepción por inscripción). Con una tasa de excepción y sin tasa del camino,
  la columna dice "Pagado" pero esa fila muestra lo acreditado a tasa de cierre.
- **Arreglo:** `const algunaConCierre = activos.some(r => r.settlement_trm != null)` para el rótulo, o rotular
  "Pagado / acreditado".

### MINOR-6 · `setPaymentPlan`: el rollback no se verifica
- **Archivo:** `lib/actions/payment-plans.ts:53`.
- **Escenario:** falla el insert del plan nuevo y también el reinsert del anterior ⇒ la inscripción queda sin plan pero el
  mensaje dice "quedó el anterior".
- **Arreglo:** `const { error: errRestaurar } = await …insert(anterior); if (errRestaurar) throw new Error("No se pudo guardar el plan y tampoco restaurar el anterior: …")`. (Mismo patrón en `route-stages.ts` al reinsertar etapas.)

### MINOR-7 · "Hoy" distinto entre JS (Bogotá) y las vistas (UTC) entre las 7 p. m. y medianoche
- **Archivos:** `lib/pagos-pendientes/datos.ts` (`vencida: vence < hoy`, con `hoyBogota()`) frente a
  `v_reservation_schedule.days_until_due` / `v_installment_status` (usan `CURRENT_DATE` de Postgres, UTC) que usa
  `critical-alerts-banner.tsx`.
- **Escenario:** de 19:00 a 24:00 en Bogotá, una cuota que vence mañana sale "vence hoy/vencida" en las alertas del camino
  y "por vencer" en el informe de giros. No mueve plata, solo confunde.
- **Arreglo:** en la base, `(now() at time zone 'America/Bogota')::date` en lugar de `CURRENT_DATE` en esas vistas
  (migración aparte), o calcular `days_until_due` en JS con `hoyBogota()`.

### MINOR-8 · El paso "Items por peregrino" del wizard sigue con la regla vieja
- **Archivo:** `components/wizard/step-por-peregrino.tsx:37-43` (no está en el diff).
- **Qué pasa:** multiplica los ítems `por_pagante` por `inscritos_total` (equipo incluido) y sin contingencia; el comentario
  dice "misma regla que effectiveLineTotal", que ahora es otra. El total del wizard ya no coincide con Presupuesto ni con el KPI.
- **Arreglo:** usar `effectiveLineTotal(i, pagantes, team, variable_buffer_pct)` por ítem (leer `pagantes_count` y
  `variable_buffer_pct` de `v_departure_finance`).

---

## Observaciones (no son bugs del diff)

- `aceptarSolicitud` (`lib/actions/registro.ts:137-138`): si solo falla enlazar `pilgrim_id` devuelve `ok:false` aunque el
  peregrino y la inscripción quedaron creados; un reintento dice "ya se resolvió". Mejor `ok:true` con aviso.
- `enviarContratoAFirmar`: si el correo salió y falla el paso a `enviado`, el error invita a reenviar (segundo correo).
  El mensaje lo aclara; aceptable.
- `add-pilgrim-to-departure.tsx`: el reintento reutiliza el peregrino si el nombre no cambió, aunque se haya corregido el
  correo o el teléfono (quedan los datos del primer intento).
- `edit-budget-item-dialog.tsx` + `payBudgetItem`: si el pago se inserta pero falla el update del ítem, reintentar duplica el
  pago. Ya pasaba antes del diff.
- `baseUrl()` en cliente (`acciones-documento.tsx`) depende de que `NEXT_PUBLIC_APP_URL` exista **en el build** de Railway;
  si no, cae a `elcamino-app-production.up.railway.app` (mismo valor que usa el servidor, así que al menos es consistente).
- Formato de teléfono: los nuevos colombianos quedan como 10 dígitos sin 57 (la base ya mezcla ambos). Si algún flujo de
  n8n (Clara/Isabel) busca peregrinos por teléfono con `57…` o `+57…`, conviene comparar por dígitos finales.
