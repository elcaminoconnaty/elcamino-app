# Hallazgos — Fuente única, cableado front↔back, tipos vs esquema

Auditoría del 2026-09-29. Solo lectura (código + SQL `select` contra la base viva
`btunvfrxegjwpznlmvjp`). Las rutas son relativas a `elcamino-app/`.

**Contexto que cambia la severidad de "datos viejos":** todas las páginas de `app/(app)` y las
públicas declaran `export const dynamic = "force-dynamic"`, y en Next 14.2 cualquier
`revalidatePath` llamado desde una server action purga **toda** la caché del router del
cliente. O sea: el riesgo real de datos viejos NO está en "le faltó revalidar /pagos" (eso se
arregla solo en la siguiente navegación), sino en (a) acciones que no revalidan nada y la UI no
hace `router.refresh()`, (b) componentes cliente que guardan datos del servidor en `useState` /
`useEffect` y no se vuelven a cargar, y (c) estado derivado guardado en la base que nadie
recalcula.

Severidades: CRÍTICO (pierde o corrompe plata / datos sin aviso) · ALTO (función rota o dato
equivocado visible a clientes) · MEDIO (inconsistencia real, riesgo acotado) · BAJO (higiene).

**Conteo:** CRÍTICO 2 · ALTO 8 · MEDIO 15 · BAJO 7.

**Orden sugerido de arreglo:** C1 (doble envío) → A1 (plantilla rota) → A7 (mensajes de error en producción) → C2 (borrado de peregrino) → A3 → A6 → A2 → A4 → A8 → M8 → resto.

---

## CRÍTICO

### C1. Doble envío crea pagos a proveedor y movimientos duplicados
- **Qué:** los formularios de plata que usan `<form action={async (fd) => …}>` no deshabilitan
  el botón mientras corre la acción. Dos toques (muy fácil en iPhone con red lenta) = dos
  `provider_payments` / `expenses` / `reservations`. No hay `useFormStatus` en todo el repo.
- **Evidencia:**
  - `components/departures/register-reservation-payment.tsx:177` (form) y `:254`
    `<Button type="submit" variant="accent">Registrar pago</Button>` — sin `disabled`.
  - `components/providers/new-provider-payment-dialog.tsx:39` y `:101` — igual.
  - `components/expenses/new-expense-dialog.tsx:112-136` y `:252` — igual (gasto o pago a proveedor).
  - `components/departures/add-reservation.tsx:83` y `:287` — crea la reserva y después las habitaciones; un doble toque deja dos reservas.
  - `components/pilgrims/new-pilgrim-dialog.tsx:20,38` — `action={createPilgrim}` directo, sin estado: dos peregrinos iguales.
  - Sí están protegidos (verificado): `new-payment-dialog.tsx:167`, `new-penalty-dialog.tsx:178`,
    `add-pilgrim-to-departure.tsx:120`, `edit-reservation-dialog.tsx:493`, `edit-budget-item-dialog.tsx:212`,
    `import-reservation-from-email.tsx:226`, `payment-plan-card.tsx` (Guardar plan).
- **Arreglo:** un solo componente `components/ui/submit-button.tsx` con `useFormStatus()` →
  `disabled={pending}` y texto "Guardando…", y usarlo en TODOS los `<form action=…>`. Para los
  de `onClick`, el patrón `saving` ya existente. Defensa en la base: índice único parcial o
  `idempotency_key uuid` (generado al abrir el diálogo) en `pilgrim_payments`,
  `provider_payments` y `expenses`, con `on conflict do nothing`.

### C2. Eliminar un peregrino puede borrar sus abonos sin preguntar (cascada + error ignorado)
- **Qué:** `deletePilgrim` decide si hay abonos con una consulta cuyo `error` se ignora. Si esa
  consulta falla, `hasPayments=false`, entra a la rama "sin abonos" y borra las inscripciones;
  `pilgrim_payments.registration_id` es `ON DELETE CASCADE` → los abonos desaparecen con ella.
  Además la rama "reembolsado" borra a propósito los pagos (y la devolución misma), así que la
  caja histórica de ese camino cambia retroactivamente.
- **Evidencia:** `lib/actions/pilgrims.ts:178-185` (`const { data } = …` sin `error`),
  `:224-230`; FK `pilgrim_payments.registration_id → registrations ON DELETE CASCADE` (SQL
  information_schema.referential_constraints). También `registrations.departure_id ON DELETE
  CASCADE` (hoy no hay acción que borre caminos — verificado — pero cualquier borrado manual
  arrastra toda la plata).
- **Arreglo:** (1) `if (error) throw` en la consulta de abonos. (2) Cambiar la FK de
  `pilgrim_payments.registration_id` a `ON DELETE RESTRICT` (la plata nunca se borra en
  cascada). (3) "Reembolsado" no debería borrar pagos: debe registrar la `devolucion` (kind ya
  existe) y soft-delete, igual que "sin_reembolso". (4) Hacer todo el borrado en una función
  SQL transaccional (`rpc('eliminar_peregrino', …)`): hoy son 5-6 llamadas sueltas; si falla la
  4ª (p. ej. `contracts.registration_id` es RESTRICT y el peregrino tiene contrato) ya se
  borraron las cuotas del plan (`:191-194`) y queda a medias.

---

## ALTO

### A1. "Aplicar plantilla" del wizard revienta siempre: inserta un estado que la base prohíbe
- **Qué:** `applyRouteTemplate` inserta `budget_items.status = "estimado"`; el CHECK de la base
  solo acepta `presupuestado|enviado|reservado|pagado|cancelado`. Todo camino nuevo creado con el
  wizard falla en el paso de presupuesto (toast "violates check constraint").
- **Evidencia:** `lib/actions/route-template.ts:90`; CHECK `budget_items_status` (pg_constraint);
  en la base no hay ni un `budget_items` con `estimado` (hoy: presupuestado 32, reservado 20,
  pagado 6, enviado 2). El tipo `BudgetItem.status` en `types/db.ts` también dice
  `"estimado"|"confirmado"|…` (mal).
- **Arreglo:** `status: "presupuestado"`. Fuente única: exportar
  `type BudgetStatus = typeof BUDGET_STATUSES[number]["value"]` desde `lib/constants.ts` (con
  `as const`) y usarlo en `types/db.ts` y en los inserts, así TypeScript lo frena.

### A2. Fechas de la plantilla/wizard mal calculadas en rutas con día 0 (Portugués)
- **Qué:** hay dos helpers para "fecha de un day_offset": `lib/rutas-fechas.ts:fechaDeDia`
  (bien, soporta día 0 con `tieneDiaCero`) y `lib/actions/route-template.ts` con
  `dateForOffset` (exportado, sin usos) + `offsetDate` (copia privada idéntica). El segundo
  trata el día 0 igual que el día 1, así que en el Portugués el día 0 cae el mismo día que el 1
  y los días negativos quedan un día corridos respecto a la carta y al documento de viaje.
- **Evidencia:** `lib/actions/route-template.ts:18-38`, usos en `:77` (budget_items.item_date),
  `:131` (días del wizard), `:159`, `:183`, `:208` (slots de alojamiento/transporte/cena).
  Base: ruta `camino-portugues-costero-200` tiene 1 etapa y 6 items de plantilla con
  `day_offset = 0`.
- **Arreglo:** borrar `dateForOffset` y `offsetDate`; en route-template cargar las etapas de la
  ruta una vez y usar `fechaDeDia(start_date, offset, tieneDiaCero(etapas))`. Fuente única:
  `lib/rutas-fechas.ts`.

### A3. Pago a proveedor + "cuota del cronograma": se marca pagada con el pago equivocado
- **Qué:** tras `createProviderPayment`, el diálogo busca "el último pago insertado" como
  `latest[latest.length-1]` de una lista ordenada por `paid_at` ascendente. Si el pago se
  registra con fecha anterior a otro ya existente (lo normal al cargar pagos atrasados), se
  enlaza a la cuota un pago que no es el recién creado.
- **Evidencia:** `components/departures/register-reservation-payment.tsx:182-194`;
  `lib/actions/provider-payments.ts:10` (`order("paid_at", asc)`); `createProviderPayment`
  (`lib/actions/reservations.ts:221`) no devuelve el id.
- **Arreglo:** que `createProviderPayment` haga `.insert(payload).select("id").single()`,
  acepte `schedule_item_id` en el FormData y marque la cuota en la misma acción del servidor
  (idealmente en una RPC). Nada de "adivinar el último".

### A4. Tipos de estado desalineados con la base (reservas y presupuesto)
- **Qué:** `types/db.ts` declara `Reservation.status = "presupuestado"|"contactado"|"reservado"|"confirmado"|"pagado"|"cancelado"`;
  la base acepta `presupuestado|enviado|reservado|pagado|cancelado`. `contactado` y
  `confirmado` no existen; falta `enviado`. Código que se apoya en los valores viejos:
  - `app/(app)/dashboard/nico/page.tsx:22` filtra `.in("status", ["presupuestado","contactado","reservado"])` → las reservas en `enviado` (hoy 2) **no aparecen** en "pendientes" del dashboard de Nico.
  - `lib/actions/parse-reservation-email.ts:42,96` le pide a Claude `contactado`/`confirmado` → al importar un correo con esos valores el insert falla por CHECK.
- **Arreglo:** una sola lista: `RESERVATION_STATUSES` de `lib/constants.ts` (ya está bien) con
  `as const`, derivar el tipo, y usarla en `types/db.ts`, el dashboard (`["presupuestado","enviado","reservado"]`) y el esquema JSON del parser (`enum: RESERVATION_STATUSES.map(s=>s.value)`).

### A5. `numeroWhatsApp` vive en un componente y deja fuera a los números no colombianos
- **Qué:** la normalización de celular para wa.me está en
  `components/pilgrims/pasos-bienvenida.tsx:52` y la importa otro componente
  (`components/departures/lista-videos.tsx:9`). Solo reconoce `+…`, `3xxxxxxxxx` y `573…`;
  un número español guardado sin `+` (`600 123 456`, `34600123456`) da `null` → el botón abre el
  selector de chats y **no marca el paso como enviado**. El formulario público
  (`lib/registro/por-token.ts:296,305`) y videos (`lib/actions/videos.ts:24`) solo validan "≥ 8
  dígitos", no normalizan al guardar.
- **Arreglo:** mover a `lib/telefono.ts` (`normalizarCelular` para guardar en E.164 y
  `numeroWhatsApp` para wa.me), aplicar `normalizarCelular` en `createPilgrim`/`updatePilgrim`/
  registro público/videos, y aceptar `34` + 9 dígitos (España) además de Colombia.

### A6. URL base: cuatro copias de `baseUrl()` con fallback a `http://localhost:3000`
- **Qué:** los enlaces que se mandan a clientes (firmar contrato, correo web, registro, carta,
  menú, documento de viaje) se construyen con `NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`.
  Si la variable falta en Railway (o se renombra), los correos y WhatsApp salen con
  `localhost` y nadie se entera. Otras copias usan `?? ""` (enlace relativo, que en un PDF/QR
  tampoco sirve) y una usa `window.location.origin`.
- **Evidencia (todas):**
  - `?? "http://localhost:3000"`: `lib/actions/menus.ts:58`, `lib/actions/contracts.ts:41`,
    `lib/actions/registro.ts:9`, `lib/actions/travel-doc.ts:20`.
  - `?? ""`: `app/video/[token]/page.tsx:21`, `app/registro/[token]/page.tsx:29`,
    `app/carta/[token]/page.tsx:20`, `app/(app)/peregrinos/[id]/page.tsx:133`,
    `components/departures/tabs/videos-tab.tsx:29`, `components/departures/tabs/contratos-tab.tsx:59`,
    `lib/contracts/sign.ts:123,320,385` (esta última va **impresa en el PDF sellado** como URL
    de verificación: con `""` queda `/verificar/<hash>` sin dominio, para siempre).
  - `window.location.origin`: `components/departures/acciones-documento.tsx:19`, `app/login/page.tsx:41`.
  - Relativos a propósito (se usan dentro del sitio, OK): `lib/bienvenida/por-token.ts:24-25`, `lib/registro/por-token.ts:152`.
- **Arreglo:** `lib/url.ts` con `export function urlPublica(path = "")` que lee
  `NEXT_PUBLIC_APP_URL`, y **lanza** si falta en producción (`NODE_ENV==="production"`); en dev
  cae a `http://localhost:3000`. Reemplazar las 14 copias. Verificar que la variable esté en
  Railway.

### A7. En producción los errores de las acciones llegan como un mensaje genérico en inglés
- **Qué:** 126 `throw new Error("…")` en `lib/actions/*.ts` (p. ej. "El peregrino ya está
  inscrito en ese camino.", "Para pagos en USD indicá la tasa…", "Para movimientos por Global 66
  indicá los euros…", "El peregrino tiene abonos: decidí…"). En Next 14 **en producción** un
  error lanzado en una server action se serializa sin mensaje: el cliente recibe "An error
  occurred in the Server Components render. The specific message is omitted in production
  builds…" (verificado en `node_modules/next` 14.2.35: el cliente de
  `react-server-dom-webpack` de producción es el que pone ese texto). Todos los
  `toast({ description: e.message })` muestran eso. En `npm run dev` sí se ve el mensaje, por eso
  no se nota al probar. Las 77 salidas `return { ok: false, error }` sí llegan bien.
- **Evidencia:** p. ej. `lib/actions/pilgrims.ts:130,187`, `lib/actions/payments.ts:20,57-60`,
  `lib/global66.ts:24`, `lib/actions/route-template.ts:54-55`; consumidores
  `components/pilgrims/new-payment-dialog.tsx`, `new-penalty-dialog.tsx`,
  `edit-registration-dialog.tsx`, etc.
- **Arreglo:** una sola convención: toda acción devuelve `Resultado<T>` (`{ok:true,…}|{ok:false,error}`),
  como ya hacen `registro.ts`, `menus.ts`, `videos.ts`. Transición rápida: helper
  `accion(fn)` en `lib/actions/_resultado.ts` que envuelve y convierte `throw` en
  `{ok:false,error:e.message}`, y un `usarAccion()` en el cliente que muestre el toast.
  Verificar en producción provocando "inscribir dos veces al mismo peregrino".

### A8. La firma del contrato puede quedar sin evidencia (errores ignorados en `contract_signers`)
- **Qué:** al firmar, la actualización del firmante (IP, user-agent, geo, `consent_text`,
  `auth_method`, `signed_at`) no mira `error`; después el contrato se cierra como `firmado`
  igual. Si esa escritura falla, el PDF sellado queda bien pero la base no tiene la evidencia
  del firmante. Lo mismo al crear el contrato: el insert de los dos firmantes
  (`lib/actions/contracts.ts:162`) y la anulación de la versión anterior (`:139`) ignoran el
  error → puede quedar un contrato sin firmantes (no se puede firmar) o dos versiones vigentes.
- **Evidencia:** `lib/contracts/sign.ts:349-362`, `:106`, `:48`, `:166`, `:255`, `:263`;
  `lib/actions/contracts.ts:52,139,162`.
- **Arreglo:** chequear `error` y abortar antes de cerrar el contrato; mejor, una RPC
  `firmar_contrato(...)` que actualice firmantes + contrato + evento en una transacción.

---

## MEDIO

### M1. Plan de pagos del peregrino: se queda viejo después de guardar o de registrar un pago
- **Qué:** `PaymentPlanCard` lee `v_installment_status` desde el navegador en un `useEffect`
  con dependencia `[registrationId]`. `router.refresh()` no lo vuelve a correr, así que tras
  guardar el plan, registrar un abono o una penalidad, la tarjeta sigue mostrando las cuotas y
  estados anteriores hasta recargar la página. El diálogo inicializa `rows` con `useState(current)`
  una sola vez, así que al reabrirlo edita la versión vieja y puede **pisar** el plan nuevo.
- **Evidencia:** `components/pilgrims/payment-plan-card.tsx:25-37`, `:123-133`.
- **Arreglo:** cargar las cuotas en el servidor (la página `peregrinos/[id]` ya es server
  component) y pasarlas como prop; o como mínimo `key={JSON.stringify(installments)}` en el
  diálogo y refetch tras guardar.

### M2. `setPaymentPlan` borra y vuelve a insertar sin transacción y sin mirar el error del borrado
- **Evidencia:** `lib/actions/payment-plans.ts:15` (delete sin `error`), `:27`. Si el insert
  falla, el plan queda vacío. Además se pierden `paid_at`/`paid_payment_id` de las cuotas ya
  pagadas (el editor no los reenvía).
- **Arreglo:** RPC transaccional `set_payment_plan(registration_id, jsonb)`, o upsert por `id`
  + borrar sobrantes, chequeando cada `error`.

### M3. Estado derivado guardado que nadie recalcula (reservas "pagado", cuotas de proveedor)
- **Qué:** `createProviderPayment` pone `reservations.status = "pagado"` cuando
  `paid_pct >= 100` (`lib/actions/reservations.ts:224-233`, sin chequear error), pero
  `updateProviderPayment`/`deleteProviderPayment` (`:70-82`) no lo revierten. Igual con
  `reservation_payment_schedule.paid = true`: al borrar el pago la FK hace `SET NULL` en
  `provider_payment_id` pero `paid` sigue `true`. Resultado: reserva "Pagado" o cuota "pagada"
  sin plata detrás.
- **Arreglo:** que "pagado" salga de la vista (`v_reservation_payments.paid_pct`,
  `v_reservation_schedule`) y no de una columna; o un trigger en `provider_payments`
  (insert/update/delete) que recalcule ambas cosas. Fuente única: la vista.

### M4. `deleteProviderPayment` / `updateProviderPayment` solo revalidan `/proveedores`
- **Evidencia:** `lib/actions/reservations.ts:74,81`. El diálogo de la reserva
  (`register-reservation-payment.tsx:82`) mantiene la lista de pagos en estado local. Por la
  purga global del router no queda viejo tras navegar, pero la pestaña de pagos del camino y el
  wizard (`/caminos/[id]/wizard`) no se refrescan en el sitio si el componente no llama
  `router.refresh()`.
- **Arreglo:** recibir `departure_id` y llamar `revalidateDeparture` + `/pagos-proveedores` +
  `/gastos`, como hace `createProviderPayment`. `updateProviderPayment` no tiene usos: borrarla
  (ver B1).

### M5. Saludo / nombre de pila calculado en 7 lugares con reglas distintas
- **Qué:** la regla "apodo o primer nombre, en tipo título" está en
  `lib/bienvenida/datos.ts:90` (`destinatarioDe`, usa `tituloDeNombre`), pero se reimplementa:
  - `app/(app)/peregrinos/[id]/page.tsx:109` (`saludo`, **sin** tipo título → el mensaje de
    WhatsApp dice "Hola MARIA" cuando el nombre vino del pasaporte en mayúsculas, mientras la
    carta dice "Maria").
  - `lib/registro/por-token.ts:112` (`saludoDe`, sin tipo título).
  - `lib/email/templates.ts:17` (`primerNombre`, ignora el apodo).
  - `app/firmar/[token]/form-firma.tsx:104`, `app/menu/[token]/form-menu.tsx:136`,
    `app/registro/[token]/form-registro.tsx:235`, `app/registro/[token]/page.tsx:74`,
    `components/departures/menus-board.tsx:256` (`split(" ")[0]` a mano).
- **Arreglo:** `lib/nombres.ts` (o `lib/passport/nombres.ts`) exporta `saludoDe(p)` =
  `tituloDeNombre(apodo || primer nombre)`; `destinatarioDe` lo usa y todos los demás lo llaman.

### M6. Tres paletas: `lib/brand.ts`, `tailwind.config.js` y `globals.css`, más hex sueltos
- **Qué:** la regla es "ningún hex fuera de `lib/brand.ts`", pero hay 42 hex en 16 archivos.
  Los peores:
  - `components/departures/cost-donut.tsx:6` — paleta vieja (`#f5c518` amarillo, `#1a1a1a`,
    `#3b82f6` azul bootstrap…) y borde `#e6dcc2` en `:31`: fuera de marca.
  - Rojo de error en 4 versiones: `ESTADO.error #9B3D3D` (brand), `error-500 #9A3C3C`
    (tailwind), `#9b2c2c` (`app/menu/[token]/form-menu.tsx:188,324`), `#8B3A2F`
    (`components/pdf/informe-pagos-pendientes.tsx:32,152,156`), fondos `#F3E3E0`/`#F3E3E3`
    (`form-registro.tsx:15`, `form-firma.tsx:195`).
  - `#EFE5D6` ("piedra suave") repetido en `app/viaje/[token]/page.tsx:128`,
    `components/pdf/carta-bienvenida.tsx:69`, `components/pdf/documento-viaje.tsx:76`,
    `components/pdf/brand-shell.tsx:64` y `tailwind.config.js:22` pero no está en `COLOR`.
  - `#e6efe8`, `#E2E8E1` (fondo ok) en `form-menu.tsx:150,307`, `form-registro.tsx:234`, `brand-shell.tsx:80`.
  - `lib/email/templates.ts:180-182` repite piedra/ocre/noche/castaño a mano.
  - `app/layout.tsx:46` `themeColor: "#3D5A6E"` (= `COLOR.atlantico`).
- **Arreglo:** agregar a `lib/brand.ts` `COLOR.piedraSuave`, y en `ESTADO` los fondos
  (`errorFondo`, `okFondo`, `infoFondo`) y un único rojo; `tailwind.config.js` debe
  `require`/importar esos valores (convertir `brand.ts` a un `.mjs`/JSON compartido o generar la
  sección de colores desde él); reemplazar los hex sueltos por `COLOR.*`/`ESTADO.*`. `#fff` en
  inputs → `COLOR.blanco` si se quiere permitir blanco. Rehacer `cost-donut` con la paleta.

### M7. `updatePilgrim` y `updateRegistration` sin revalidar lo que muestran otros lados
- `lib/actions/pilgrims.ts:74` solo revalida `/peregrinos/${id}`; el nombre sale también en el
  menú lateral (`navCaminos` en el layout), en `/caminos/[id]` y en `/pagos`. Con la purga
  global no es grave, pero el layout se re-renderiza solo con `router.refresh()`; confirmar que
  el diálogo de edición lo llama.
- `updateRegistration` (`:104-108`) no revalida nada — y no tiene usos (ver B1).

### M8. "Hoy" calculado en UTC: después de las 7 p. m. en Colombia la fecha sale de mañana
- **Qué:** `new Date().toISOString().slice(0,10)` da la fecha UTC. En Colombia (UTC−5) desde
  las 19:00 es el día siguiente; en el servidor de Railway (UTC) igual. Afecta la fecha por
  defecto de pagos, penalidades, pagos a proveedor, gastos, TRM y cierre, la TRM que se busca
  para esa fecha (`getTrmForDate`) y **la fecha de firma impresa en el contrato**.
- **Evidencia:** `components/pilgrims/new-payment-dialog.tsx:30`, `new-penalty-dialog.tsx:25`,
  `closing-payment-dialog.tsx:43`, `settlement-trm-dialog.tsx:34`,
  `components/departures/register-reservation-payment.tsx:33,192`,
  `edit-reservation-dialog.tsx:66`, `edit-budget-item-dialog.tsx:26`,
  `components/expenses/new-expense-dialog.tsx:47`, `components/trm/new-trm-form.tsx:11`,
  `components/departures/freeze-trm-banner.tsx:34`, `reservation-payment-schedule-editor.tsx:44,64`,
  `lib/actions/reservations.ts:211`, `lib/actions/expenses.ts:14`,
  `lib/actions/payment-plans.ts:37`, `lib/pagos-pendientes/datos.ts:139` (qué está "vencido"),
  `lib/contracts/datos.ts:209` (fecha de firma).
- **Arreglo:** `lib/fechas.ts` con `hoyISO(zona = "America/Bogota")` usando
  `Intl.DateTimeFormat("en-CA",{timeZone})`; reemplazar todas. Los nombres de archivo de
  exportación pueden quedarse.

### M9. Dos maneras de crear un peregrino, y la de "inscribir" deja huérfanos
- **Qué:** `createPilgrim` (server action, `lib/actions/pilgrims.ts:6`) y
  `POST /api/pilgrims` (`app/api/pilgrims/route.ts`, solo 4 campos). El diálogo
  "Inscribir peregrino" crea el peregrino por la API y **después** la inscripción; si la
  inscripción falla (p. ej. total inválido, que se valida después de crear), el peregrino
  queda creado sin inscripción, y al reintentar se crea otro igual. El mensaje real de la API
  se pierde (`throw new Error("Error creando peregrino")`).
- **Evidencia:** `components/departures/add-pilgrim-to-departure.tsx:29-62` (validación de
  `total` en `:55-56`, después del POST).
- **Arreglo:** una acción `inscribirPeregrinoNuevo({datos, departure_id, total_eur, …})` que
  valide primero y haga ambos inserts (idealmente RPC transaccional); borrar
  `app/api/pilgrims/route.ts`.

### M10. El OCR del pasaporte pisa `country` con lo que lee, sin normalizar
- **Qué:** `camposDesdePasaporte` escribe `country = data.country` tal cual. Hoy en la base hay
  7 formas para 2 países: `México` 9, `MEXICO` 1, `MEX` 1, `COL` 7, `REPÚBLICA DE COLOMBIA` 2,
  `COLOMBIA` 1, `Colombia` 7. Cualquier filtro/agrupación por país (exportes, seguro) sale partido.
- **Evidencia:** `lib/passport/extraer.ts:112`; SQL `select country, count(*) from pilgrims group by 1`.
- **Arreglo:** `lib/paises.ts` con `normalizarPais()` (ISO-3 → nombre en español) usado por el
  OCR, el formulario público y `createPilgrim/updatePilgrim`; migración de datos una vez.
  Guardar la lectura cruda solo en `passport_ocr`.

### M11. Ocupación del camino: tres números distintos contra la misma capacidad
- `/caminos` y dashboard de Nico: `pilgrims_count / capacity` de `v_departure_summary` (incluye
  al equipo) → "15 / cap".
- Ficha del camino, pestaña Resumen: `pagantes_count / capacity` + "+2 equipo" → "13 / cap".
- Ficha del camino en celular: `inscritos_total / capacity` → "15/cap inscritos".
- Dashboard de Naty: "15 peregrinos".
- **Evidencia:** `app/(app)/caminos/page.tsx:56`, `app/(app)/dashboard/nico/page.tsx:65`,
  `app/(app)/dashboard/naty/page.tsx:224`, `components/departures/tabs/resumen-tab.tsx:34`,
  `app/(app)/caminos/[id]/page.tsx:136`.
- **Arreglo:** decidir si la capacidad cuenta al equipo (lo lógico: sí, ocupa cama) y usar
  siempre `inscritos_total` con la etiqueta "inscritos (N pagantes + M equipo)". Fuente única:
  `v_departure_finance`.

### M12. Fórmulas de plata del camino duplicadas (para el auditor de cuentas)
- El costo/ingreso del camino se calcula en **dos vistas** (`v_departure_summary` y
  `v_departure_finance`, misma fórmula de `fijo_grupo/por_inscrito/por_pagante/viatico_team` y
  buffer) y otra vez en JS (`lib/finance.ts` `simulateScenario`, `effectiveLineTotal`, usados por
  `resumen-tab.tsx` y `presupuesto-tab.tsx` que además leen `budget_items` directo). Hoy coinciden
  (SQL: los 3 caminos dan igual ingreso esperado, cobrado y costo en ambas vistas), pero
  cualquier cambio a una sola las separa.
- **Arreglo:** que `v_departure_summary` se defina como `select … from v_departure_finance`
  (o se elimine y `/caminos` y dashboards lean `v_departure_finance`); en JS dejar solo la
  simulación de escenarios, alimentada por los unitarios de la vista.

### M13. `pre_inscrito` se trata como inscrito en todo (plata, rooming, contratos masivos)
- **Qué:** `aceptarSolicitud` crea la inscripción en `pre_inscrito` con `total_eur =
  base_price_eur` (`lib/actions/registro.ts:108-115`). Todos los filtros son
  `status <> 'cancelado'`, así que un pre-inscrito suma ingreso esperado, ocupa capacidad,
  aparece en rooming y menús, y entra al envío masivo de contratos
  (`lib/actions/contracts-bulk.ts:55`). Hoy hay 0 pre-inscritos, así que no ha pasado.
- **Arreglo:** decidir la regla y escribirla una vez: p. ej. `lib/estados.ts`
  `ESTADOS_ACTIVOS = ["inscrito","confirmado","viajado"]` y en SQL una función
  `es_inscripcion_activa(status)` usada por las vistas.

### M14. `types/db.ts` está casi todo muerto y desactualizado; el cliente de Supabase no tiene tipos
- **Qué:** de 23 tipos, 15 no los importa nadie (`Route`, `Pilgrim`, `Registration`,
  `PilgrimPayment`, `Provider`, `Reservation`, `ProviderPayment`, `BudgetItem`, `Expense`,
  `TrmRate`, `RoomAssignment`, `ReservationOptOut`, `ReservationMenuCourse`,
  `ReservationMenuOption`, `ProviderPaymentAccount`), y varios están mal (A1, A4; `Departure`
  sin 17 columnas; `PilgrimPayment.kind` dice "abono | cierre | devolucion" sin `penalidad`).
  `createServerClient` se crea sin genérico `<Database>`, así que todo `.select` devuelve `any`
  (478 `any` en el código). `tsc --noEmit` pasa limpio, pero no protege nada de la base.
- **Arreglo:** generar `types/database.ts` con `supabase gen types typescript --project-id
  btunvfrxegjwpznlmvjp` (o la herramienta MCP `generate_typescript_types`), tipar
  `createClient()`/`createAdminClient()` con `<Database>`, y derivar los alias
  (`Tables<"pilgrims">`) en lugar de escribirlos a mano. Borrar los tipos muertos.

### M15. Escrituras del formulario público que ignoran el error
- `lib/registro/por-token.ts:258,266,281`: guardar `passport_image_path` y lo leído por OCR no
  chequea `error`. Si falla, el peregrino ve "listo" pero la ficha no tiene su pasaporte.
- `lib/actions/registro.ts:117`: la solicitud no se marca `aceptada` si falla → se puede
  aceptar dos veces y crear dos peregrinos.
- `lib/actions/reservation-rooms.ts:56,76`, `rooming-email.ts:154,163`, `menu-email.ts:124,133`
  (fecha de envío/hilo de Gmail), `provider-photos.ts:66`, `payment-plans.ts:15`.
- **Arreglo:** `const { error } = …; if (error) return { ok:false, error: error.message }` en
  todas; en `aceptarSolicitud` hacer el `update … where status='pendiente'` **primero** como
  candado.

---

## BAJO

### B1. Acciones del servidor exportadas sin ningún uso (código muerto con permisos de escritura)
Cada `export` en un archivo `"use server"` es un endpoint público invocable (con la sesión del
usuario). Sin uso en `app/`, `components/` ni `lib/`:
- `lib/actions/contracts.ts:292` `urlDescargaContrato`, `:333` `avisarFirma`
- `lib/actions/menus.ts:329` `rotarEnlaceMenu`
- `lib/actions/payment-plans.ts:33` `markInstallmentPaid`, `:44` `getInstallments`
- `lib/actions/pilgrims.ts:104` `updateRegistration` (acepta `payload: any` → escribe cualquier columna, incluido `status`/`total_eur`)
- `lib/actions/reservations.ts:70` `updateProviderPayment` (`payload: any`)
- `lib/actions/route-template.ts:18` `dateForOffset`, `:188` `getCenaSlots`
- `lib/actions/settlement.ts:15` `getSettlement` (solo uso interno, `:160`), `:26` `getPaymentsWithSettlement`
- `lib/actions/trm.ts:14` `deleteTrm`
- **Arreglo:** borrarlas (o quitarles el `export` si se usan internamente). Las que aceptan
  `payload: any` son las primeras.

### B2. Todas las rutas `app/api/**` tienen quien las llame
Verificado: `api/pilgrims` (add-pilgrim-to-departure), `api/export/peregrinos`, las 5 de
`api/export/caminos/[id]/*`, y las 11 de `api/pdf/*` tienen al menos un enlace o `fetch`.
(Sin hallazgo; queda aquí para no repetir la búsqueda.)


### B3. Componentes de UI sin uso
`components/ui/tabs.tsx`, `components/ui/select.tsx` (nadie los importa). Borrar.

### B4. Columnas de la base que el código no usa (datos muertos)
- `registrations.penalty_eur`, `registrations.penalty_note`: todas en 0/null; la penalidad vive
  en `pilgrim_payments` (kind `penalidad`) y ninguna vista las lee. Tienen un CHECK propio. Borrar
  para que nadie vuelva a escribir ahí.
- `providers.bank_name, account_holder, iban, swift_bic, bizum_phone, payment_method_default,
  payment_notes`: legado de antes de `provider_payment_accounts` (1 proveedor todavía tiene
  datos, y ya tiene cuenta migrada). Borrar tras verificar.
- `reservations.last_email_update_at`, `contracts.last_reminder_at`,
  `registration_requests.resolved_by`: nunca se escriben. `pilgrim_payments.receipt_pdf_path` y
  `proof_path`: 0 filas con datos.

### B5. Estados mostrados crudos y mapeo estado→color repetido
- `app/(app)/caminos/page.tsx` `<Badge>{d.status}</Badge>` muestra `open`/`planning` en inglés;
  `components/wizard/step-cenas.tsx:63`, `step-alojamientos.tsx:96`, `step-transportes.tsx:79`
  muestran `r.status` crudo.
- El mapeo `pagado→success, reservado→accent, …` está copiado en `reservas-tab.tsx:191`,
  `viaticos-tab.tsx:128`, `budget-by-category.tsx:157`, `step-por-peregrino.tsx:92`,
  `step-viaticos.tsx:128`, `gastos/page.tsx:240` y los wizard.
- **Arreglo:** `components/ui/estado-badge.tsx` que reciba `(tipo, valor)` y saque etiqueta de
  `lib/constants.ts` y color de un solo mapa.

### B6. Identidad de la organizadora duplicada
`lib/actions/contracts.ts:173-174` escribe "NATALIA LARGO DURÁN" / "C.C. 1.037.593.713" a
mano; el mismo dato está en `lib/contracts/minuta.seed.json:536-537` (firmantes de la minuta).
Leerlo de la minuta vigente. Igual `lib/email/firma.ts:11` repite `sitio` en vez de
`CONTACTO.sitio`, y `components/departures/gmail-thread-dialog.tsx:28` repite el correo en vez
de `CONTACTO.correo`.

### B7. `deleteProviderPayment` / borrado de pago: la UI de la reserva no revierte la cuota
Ver M3; se anota aparte porque el arreglo de UI (`register-reservation-payment.tsx:82`) es
volver a pedir el cronograma después de borrar, además del arreglo de base.

---

## Verificado correcto

- **Columnas en consultas:** script que cruza cada `.from("t").select("…")` (incluidos los
  embebidos `pilgrims:pilgrim_id(…)`) y cada `.eq/.neq/.in/.is/.order/.lte/.gte("col")` contra
  `information_schema.columns` de la base viva: **0 columnas inexistentes** en `app/`,
  `components/`, `lib/` (327 `.select`). No hay typos silenciosos.
- **Rutas `app/api/**`:** las 18 tienen al menos un llamador (ver B2).
- **Acciones del servidor:** todas las no listadas en B1 tienen llamador; `tsc --noEmit` pasa
  sin errores, así que los argumentos coinciden con las firmas (dentro de lo que el `any` permite).
- **Revalidación:** todas las acciones que escriben llaman al menos un `revalidatePath` (salvo
  `updateRegistration`, muerta), y todas las páginas son `force-dynamic`; con la purga global
  del router de Next 14.2 no hay página que quede vieja tras navegar. Los riesgos reales son los
  de estado de cliente (M1) y estado derivado guardado (M3).
- **Pagos del peregrino y penalidades:** `new-payment-dialog.tsx` y `new-penalty-dialog.tsx`
  sí bloquean el doble envío (`disabled={saving}`), y las acciones revalidan `/peregrinos`,
  `/caminos`, `/pagos`, `/dashboard/naty`.
- **Filtros de cancelados y eliminados:** consistentes en listas, conteos, exportes, PDFs y
  páginas por token: todos excluyen `status = 'cancelado'` y `pilgrims.deleted_at`; las vistas
  `v_departure_finance`, `v_departure_summary`, `v_rooming_list`, `v_menu_choices`,
  `v_upcoming_installments` filtran cancelados; `v_menu_choices` además `deleted_at`. Un
  eliminado siempre tiene su inscripción en `cancelado` (`deletePilgrim` lo garantiza), así que
  las vistas sin `deleted_at` no lo cuelan. `is_team` se excluye donde corresponde (contratos,
  videos, ingreso esperado) y se incluye en rooming/menús.
- **Estados de inscripción y camino:** `REGISTRATION_STATUSES` y `DEPARTURE_STATUSES` de
  `lib/constants.ts` coinciden exactamente con los CHECK de la base.
- **`console.log` / TODO / FIXME:** ninguno en `app/`, `components/`, `lib/`.
- **Fechas de la carta y el documento de viaje:** usan la fuente única `lib/rutas-fechas.ts`
  (con día 0); el problema es solo route-template (A2).
- **`numeroWhatsApp`:** hoy los 14 celulares sin `+` de la base son colombianos de 10 dígitos
  (se completan bien con 57) salvo uno mexicano que empieza por 2 (da `null`, no se manda a un
  desconocido). El riesgo de A5 es a futuro: un celular mexicano que empiece por 3 (Guadalajara,
  33…) guardado sin `+` se mandaría a un número colombiano.
