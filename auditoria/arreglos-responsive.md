# Arreglos responsive — iPhone — 2026-09-29

Sigue a `hallazgos-responsive.md`. Ya estaban hechos antes de esta tanda (otro frente, no se tocaron):
R-03, R-04, R-05, R-06 (CSS global de `select`), R-07, R-09, R-14, R-15, R-16, R-20, R-21, R-24 y parte de R-25.

Regla en todos: clases móviles primero y `sm:` devolviendo el estilo de escritorio de antes. Nada de lógica,
datos ni fórmulas de plata.

| ID | Qué se hizo | Archivos |
|---|---|---|
| R-01 | `INPUT` con `minWidth: 0` + `display: block`; `minWidth: 0` en el `Campo` y en los dos `<fieldset>`; los `type="date"` con `appearance: none` y 44px de alto solo en móvil (`max-sm:`); el `input type=file` con `maxWidth: 100%`; los select de indicativo no se encogen (`flexShrink: 0`). | `app/registro/[token]/form-registro.tsx` |
| R-02 | Cenas: en móvil una tarjeta por peregrino (nombre + estado, cada plato como select de 44px a lo ancho, "Alimentación", botones "No cena" y "Copiar enlace" de 40px). La tabla queda `hidden sm:block`. El "deshacer" de los chips "No cenan" pasa a 32×32 en móvil. | `components/departures/menus-board.tsx` |
| R-06 | `w-full` en los `<select>` de formulario listados (todos dentro de `grid gap-2`, así que en escritorio ya se estiraban: no cambia nada ahí). `expenses-filters` no: es barra de filtros y ya la cubre el CSS global. | `app/(app)/caminos/nuevo/page.tsx`, `components/wizard/step-basicos.tsx`, `components/expenses/new-expense-dialog.tsx`, `components/expenses/edit-expense-dialog.tsx`, `components/providers/campos-cuenta.tsx`, `components/providers/new-provider-dialog.tsx`, `components/providers/edit-provider-form.tsx`, `components/departures/add-reservation.tsx`, `components/pilgrims/edit-registration-dialog.tsx`, `components/departures/add-pilgrim-to-departure.tsx` |
| R-08 | "Excel solo de <proveedor>" → en móvil "Excel de este hotel / restaurante" (el nombre ya está en el título de la tarjeta); en escritorio el texto de siempre. | `components/departures/rooming-board.tsx`, `components/departures/menus-board.tsx` |
| R-10 | El límite interno de alto/scroll solo desde `sm` (`sm:max-h-[..] sm:overflow-y-auto`); en el celular desplaza el diálogo. | `components/providers/payment-accounts-card.tsx`, `components/departures/add-reservation.tsx`, `components/departures/bloque-pago-reserva.tsx`, `components/routes/editor-etapas.tsx`, `components/pilgrims/payment-plan-card.tsx`, `components/contracts/envio-masivo.tsx` |
| R-11 | `max-h-[90vh]`/`[85vh]` → `sm:max-h-…` (en el celular el diálogo ocupa toda la pantalla). Además el botón "Copiar el de la última vez (…)" del editor de menú parte línea en móvil (se salía). | `components/departures/menu-editor.tsx`, `components/departures/enviar-proveedor-dialog.tsx`, `components/departures/gmail-thread-dialog.tsx` |
| R-12 | Plan de pagos: en móvil dos líneas por cuota (nombre + quitar de 40px; fecha + monto), `sm:grid-cols-12` como antes. Calendario de pagos de la reserva: fecha y nombre 6/12 en móvil, campos de 40px y 16px, botones de 40px. | `components/pilgrims/payment-plan-card.tsx`, `components/departures/reservation-payment-schedule-editor.tsx` |
| R-13 | Etapas de la ruta: en móvil una tarjeta por etapa (Día/Tipo, Desde/Hasta, Km/Horas, "Quitar etapa" de 40px a lo ancho); la tabla `hidden sm:table`. | `components/routes/editor-etapas.tsx` |
| R-17 | `/firmar`: en móvil un botón grande "Abrir el contrato completo (PDF)" (`target="_blank"`, sin `download`; el PDF se sirve `inline`) en vez del iframe; iframe y enlace "Descárgalo en PDF" quedan `hidden sm:block`. | `app/firmar/[token]/form-firma.tsx` |
| R-18 | Tocables: "no duerme acá" 32px de alto y en una línea; deshacer de chips 32×32; lápices de editar (reserva, ítem, gasto, pago) 40×40 en móvil; ícono de Gmail en Reservas 40×40; "Menú" y "0/15" de Reservas y "Abrir la ficha →" con `py-2`; selector de tasa `h-9`; "PDF" de pagos de la ficha con `py-2`; casilla y correo de "Enviar como prueba" (20px / 40px a lo ancho); casillas de consentimiento en `/firmar` 20px; "No voy a cenar esta noche" 20px + `py-2`; "No soy yo" del menú público con área de 6px arriba y abajo y sin partirse. | `rooming-board.tsx`, `menus-board.tsx`, `edit-reservation-dialog.tsx`, `edit-budget-item-dialog.tsx`, `edit-expense-dialog.tsx`, `edit-payment-dialog.tsx`, `gmail-thread-dialog.tsx`, `tabs/reservas-tab.tsx`, `tabs/contratos-tab.tsx`, `components/ui/eur-cop.tsx`, `app/(app)/peregrinos/[id]/page.tsx`, `components/pilgrims/contract-card.tsx`, `app/firmar/[token]/form-firma.tsx`, `app/menu/[token]/form-menu.tsx`, `app/menu/c/[token]/page.tsx` |
| R-19 | Habitaciones y Cenas: al montar, si la pantalla es < 640px, queda abierta solo la primera noche/cena que falta completar (en Habitaciones, la primera con habitaciones); en escritorio igual que antes. Gastos: nuevo `PlegableMovil` (CSS `hidden sm:block`, sin parpadeo en escritorio) para "Saldo por cuenta", "Pendiente por pagar a proveedores" y "Pendiente del presupuesto": en móvil arrancan plegados con el total a la vista. Habitaciones pasó de ~18.700 a ~3.900px; Gastos de ~20.300 a ~4.500px. No se paginaron los movimientos (sería cambiar la consulta). | `components/departures/rooming-board.tsx`, `components/departures/menus-board.tsx`, `components/ui/plegable-movil.tsx` (nuevo), `components/finance/account-balances-card.tsx` (prop `plegableEnMovil`), `app/(app)/gastos/page.tsx` |
| R-22 | Wizard → Días planificados: en móvil grilla `auto | tramo | fecha`, el tipo se oculta, los km bajan a una segunda línea y la fecha va corta (dd/mm) sin partirse; desde `sm` la fila de siempre (`contents` / `sm:flex`). | `components/wizard/step-basicos.tsx` |
| R-23 | "N pagos sin datos completos": en móvil cada pago en su bloque con separador (`flex-col border-b py-1.5`), desde `sm` la fila de antes. | `app/(app)/pagos-proveedores/page.tsx` |
| R-25 | TRM: `<Table apilar={false}>` y fecha sin partir. Columnas de acciones ("Registrar", "Cerrar"): nuevo atributo `data-acciones` en el `<TableHead>` → en la tarjeta del celular esa celda va sin etiqueta (fila de botones); en escritorio el encabezado se sigue viendo. Ficha del peregrino: la raíz pasa de `space-y-6` a `flex flex-col gap-6` y Contacto/Emergencia/Pasaporte llevan `max-sm:order-last` (en el celular arriba queda inscripción, plan y pagos). Menú público: el `margin: 0` en línea del `<fieldset>` le ganaba al `space-y-4`; ahora solo anula los lados y abajo, y las secciones quedan separadas (aplica en toda pantalla; es la separación que el contenedor ya pedía). | `app/(app)/trm/page.tsx`, `components/ui/table.tsx`, `components/departures/tabs/pagos-tab.tsx`, `components/departures/tabs/liquidacion-tab.tsx`, `app/(app)/peregrinos/[id]/page.tsx`, `app/menu/[token]/form-menu.tsx` |
| R-26 | `target="_blank" rel="noopener"` junto a `download` en todas las descargas de Excel/PDF (en escritorio `download` manda y baja igual; en la app de inicio de iOS se abre en Safari). A los dos que no tenían `download` (Excel de pagos pendientes en Qué hay que pagar, PDF "descargar" de la carta) se les agregó. | `app/(app)/peregrinos/page.tsx`, `app/(app)/caminos/[id]/page.tsx`, `components/departures/menus-board.tsx`, `components/departures/rooming-board.tsx`, `components/departures/bienvenida-registro-camino.tsx`, `components/departures/tabs/pagos-tab.tsx`, `app/(app)/pagos-proveedores/page.tsx`, `components/pilgrims/pasos-bienvenida.tsx`, `app/firmar/[token]/form-firma.tsx` |

## Encontrado al verificar (fallas de la tanda anterior)

- **R-14 (tablas apiladas): tarjetas con huecos de ~230px por celda.** La regla `grid` heredaba el `gap: .75rem` del
  `td` flex como `row-gap`, y como la etiqueta abarca 20 filas implícitas cada celda sumaba 19 huecos. `/gastos`
  medía ~20.000px con 10 movimientos. Arreglo: `row-gap: 0` en `.tabla-apilable td[data-label]`. — `app/globals.css`
- **R-24 (EUR · COP): el COP se salía de las tarjetas angostas.** Los dos `whitespace-nowrap` iban pegados sin
  espacio entre medio, así que no había dónde partir (`/gastos` medía 397px en un iPhone de 390). Arreglo: `<wbr />`
  entre los dos (no ocupa lugar: en escritorio se ve igual). — `components/ui/eur-cop.tsx`

## Verificación (WebKit, Playwright)

Ancho del documento (pantalla 390 / 320):

| Ruta | iPhone 13 (390) | iPhone SE 1ª gen (320) |
|---|---|---|
| `/registro/<token>` | 390 (antes 414) | 320 (antes 414) |
| `/firmar/<token>` (por firmar) | 390 | 320 |
| `/menu/c/<token>?yo=…` | 390 | 320 |
| camino · `?tab=cenas` | 390 | 320 |
| camino · `?tab=habitaciones` | 390 | 320 (antes 332) |
| camino · `?tab=pagos` | 390 | 320 |
| camino · `?tab=liquidacion` | 390 | 320 |
| camino · `?tab=reservas` | 390 | 320 |
| camino · `?tab=contratos` | 390 | 320 |
| `/caminos/<id>/wizard` | 390 | 320 |
| `/caminos/nuevo` | 390 | 320 |
| `/gastos` | 390 (397 antes del arreglo de R-24) | 320 |
| `/trm` | 390 | 320 |
| `/pagos-proveedores` | 390 | 320 |
| `/peregrinos/<id>` (ficha) | 390 | 320 |
| `/peregrinos` | 390 | 320 |

Diálogos abiertos (solo mirar, Escape): Plan de pagos, Etapas de la ruta, Menú del restaurante, Agregar cuenta —
todos a pantalla completa (664px de alto), sin desbordes. Escritorio (1280): registro, cenas, habitaciones, gastos,
ficha, wizard y firmar sin cambios visibles y sin desbordes.

Capturas: `auditoria/capturas/despues/{iphone13,iphonese,escritorio,dialogos}/`.

Queda: el aviso "montado" del detector en "No soy yo" del menú público es el área de toque extendida del enlace
que roza el nombre de la línea de arriba (transparente, no se ve). Los inputs `text-xs` del editor de menú siguen en
12px (no hacen zoom por `maximum-scale=1`). R-26 hay que confirmarlo en el iPhone de Nico en modo pantalla de inicio.
