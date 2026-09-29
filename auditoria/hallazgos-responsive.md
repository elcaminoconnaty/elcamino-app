# Hallazgos responsive — iPhone (WebKit) — 2026-09-29

Revisión solo-lectura. Motor: WebKit (Playwright 1.48.2) emulando **iPhone 13 (390×844)** e
**iPhone SE (375×667)**. Capturas en `auditoria/capturas/iphone13/` y `auditoria/capturas/iphonese/`
(+ `auditoria/capturas/scroll/` para vistas con scroll y `auditoria/capturas/dialogos/` para diálogos).

Severidad: **ALTO** = inusable / se monta / no se puede tocar en iPhone · **MEDIO** = incómodo ·
**BAJO** = cosmético.

> Nota de método: el primer barrido de rutas que el servidor dev compilaba por primera vez
> terminó en `/dashboard/naty` (Fast Refresh "full reload" en dev). Esas rutas se volvieron a
> capturar ya compiladas. No es un bug de la app en producción.

## Contexto verificado en código

- `app/layout.tsx:45` → viewport `width=device-width, initial-scale=1, maximum-scale=1` (verificado en
  el HTML servido). Con `maximum-scale=1` iOS **no** hace auto-zoom al enfocar inputs de <16px, así que
  los `text-sm`/`text-xs` en inputs no disparan zoom; quedan como tema de legibilidad (BAJO).
- No hay `viewport-fit=cover`, así que en modo standalone el contenido queda dentro del área segura;
  los `env(safe-area-inset-*)` valen 0 salvo en `/video`. Consistente, sin solapes con la muesca.

## Hallazgos

### R-01 · ALTO · `/registro/<token>` (formulario del peregrino, público) — la página entera se desliza de lado
- **Visto:** en iPhone 13 el documento mide **414px** (pantalla 390) y en iPhone SE también 414 (pantalla 320).
  El recuadro "TU PASAPORTE" se sale por la derecha y arrastra con él toda la página: el peregrino puede
  mover la página de lado y el resto de campos queda descentrado. `capturas/iphone13/publicas/registro_d8a1…png`,
  `capturas/iphonese/publicas/registro_d8a1…png`. Informe: 14–17 elementos desbordan (fieldset, inputs de fecha).
- **Causa:** `app/registro/[token]/form-registro.tsx:284` — `<fieldset>` tiene por defecto
  `min-inline-size: min-content`, y los `<input type="date">` de WebKit (líneas 303 y 306) tienen un ancho
  intrínseco grande; el fieldset no se deja encoger. Lo mismo el fieldset del familiar (línea 329).
- **Arreglo:** en ambos fieldset agregar `minWidth: 0` al `style` (o `className="min-w-0"`), y en la constante
  `INPUT` (línea 12) agregar `minWidth: 0, display: "block"`. Para los date además
  `WebkitAppearance: "none", appearance: "none", minHeight: 44` (si no, en iOS quedan con altura distinta al resto).

### R-02 · ALTO · Pestaña **Cenas** del camino (`?tab=cenas`) — "no cena", copiar enlace y los platos quedan fuera de la pantalla
- **Visto:** la tabla por restaurante muestra "Peregrino | Alimen…" y el resto de columnas (platos con su
  `<select>`, "Alimentación", botón "no cena", botón copiar enlace) queda a la derecha, fuera de vista, dentro
  de un `overflow-x-auto` sin ninguna pista de que se puede deslizar. `capturas/iphone13/caminos_39fc…_tab_cenas.png`,
  `capturas/scroll/cenas-tabla-y1250.png`. Cuando un restaurante tenga menú cargado, cada plato agrega una
  columna de `min-w-[120px]`, así que la tabla será aún más ancha.
- **Controles diminutos:** botón "no cena" **63×24px**, botón copiar enlace **20×20px** (`p-1` con ícono de 12px).
- **Causa:** `components/departures/menus-board.tsx:396-470` — `<table>` crudo con `whitespace-nowrap` en el
  nombre (417), `min-w-[120px]` en los select (442), `max-w-[160px] truncate` en alimentación (452), botón
  `p-1` (466), texto `text-[10px]` (464).
- **Arreglo:** en móvil renderizar una tarjeta por peregrino en vez de fila:
  `<div className="sm:hidden space-y-2">{peregrinos.map(p => <div className="rounded-lg border p-3 space-y-2">`
  nombre + estado arriba; cada plato como `<label className="block text-xs">{curso}<select className="mt-1 h-11 w-full text-base …">`;
  abajo `flex gap-2` con "no cena" y "copiar enlace" como `Button size="sm" className="h-10 flex-1"`), y dejar la
  tabla actual con `className="hidden sm:block overflow-x-auto"`. Como mínimo: botón copiar
  `className="inline-flex h-9 w-9 items-center justify-center …"` y "no cena" `h-9 px-3 text-xs`.

### R-03 · MEDIO · Todas las pestañas del camino — el contenido empieza por debajo del primer pantallazo
- **Visto:** en iPhone 13 la cabecera del camino (título, fila de botones, "Plata del camino", banner de
  24 alertas, aviso de comidas) mide **~860px** antes de la barra de pestañas; la pantalla es de 844. Cada vez
  que Nico cambia de pestaña tiene que hacer scroll para ver algo. En SE (568 de alto) es pantalla y media.
  `capturas/iphone13/caminos_39fc…_tab_*.png` (todas iguales arriba).
- **Causa:** `app/(app)/caminos/[id]/page.tsx:80-146` + `CriticalAlertsBanner` (lista de chips siempre visible
  aunque el `<details>` esté cerrado) + `MealCoverageBanner`.
- **Arreglo:** (a) en móvil mostrar el banner de alertas en una sola línea: dentro del `<summary>` dejar solo
  "⚠ 24 alertas" + "Ver", y mover los chips adentro del cuerpo del `<details>` (`hidden group-open:flex` o
  `sm:flex`); (b) `MealCoverageBanner` cuando todo está cubierto: `hidden sm:flex` (es un mensaje de "todo bien");
  (c) los tres Excel (Habitaciones/Cenas/Peregrinos) agruparlos en un menú "Excel ▾" en móvil
  (`sm:hidden` un `<details>` con los tres enlaces, `hidden sm:inline-flex` los botones actuales). Con eso la
  barra de pestañas queda a ~420px.

### R-04 · MEDIO · Barra de pestañas del camino — la pestaña activa no se ve y no hay pista de que hay más
- **Visto:** 13 pestañas en una fila deslizable; en 390px solo se ven "Resumen · Pagos · Liquidación ·
  Peregrinos". Al entrar a Contratos, Reservas, Habitaciones, Cenas, etc. la pestaña activa queda fuera de la
  pantalla (solo asoma un pedazo del subrayado a la derecha) y nada indica que la barra se desliza.
  `capturas/iphone13/caminos_39fc…_tab_contratos.png`, `…_tab_cenas.png` (arriba de la pestaña).
- **Causa:** `app/(app)/caminos/[id]/page.tsx:172-189` — `<nav className="flex … overflow-x-auto">` de `Link`
  renderizados en el servidor, sin `scrollIntoView` ni degradé.
- **Arreglo:** (a) pequeño componente cliente que al montar haga
  `nav.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" })` y poner
  `aria-current={activeTab === t.value ? "page" : undefined}` en cada Link; (b) degradé a la derecha:
  envolver el nav en `relative` y agregar
  `<div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-alba sm:hidden" />`;
  (c) `snap-x` en el nav y `snap-start` en cada Link; ocultar la barra de scroll con `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`.

### R-05 · MEDIO · Pestaña **Pagos** — tarjetas de resumen de 3 columnas: los montos no caben
- **Visto:** "Esperado / Cobrado / Falta por cobrar" y "Costo total / Pagado / Falta por pagar" en 3 columnas
  de ~110px: el "EUR 34.242,00 ·" llega al borde de la tarjeta, el "·" queda colgando y el COP salta abajo. En SE
  (320px) el documento mide **328px**: desborda. `capturas/iphone13/caminos_39fc…_tab_pagos.png`,
  `capturas/iphonese/caminos_39fc…_tab_pagos.png`.
- **Causa:** `components/departures/tabs/pagos-tab.tsx:75` (`grid-cols-3` sin base móvil cuando no hay cierre) y
  `:177` (`grid-cols-3`).
- **Arreglo:** `:75` → `hayCierre ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 min-[400px]:grid-cols-3"` — mejor
  aún `grid-cols-2 sm:grid-cols-3` con la tercera tarjeta `col-span-2 sm:col-span-1`; `:177` igual. En
  `SummaryCard` (:276) agregar `min-w-0` al Card y `break-words` al valor.

### R-06 · MEDIO · `<select>` nativos sin `w-full min-w-0` — se salen del formulario cuando una opción es larga
- **Visto:** en iPhone SE `/caminos/nuevo` mide **353px** (pantalla 320): el select "Ruta" toma el ancho de la
  opción más larga y empuja la página. Igual en el **Wizard → Básicos** (`/caminos/<id>/wizard`, 353px en SE).
  `capturas/iphonese/caminos_nuevo.png`, `capturas/iphonese/caminos_39fc…_wizard.png`.
- **Causa:** ~30 `<select>` crudos con `className="h-10 rounded-md border … px-3 text-sm"` sin ancho: dentro de
  un `grid`, el ítem tiene `min-width:auto` = ancho de la opción más larga. Ej.: `app/(app)/caminos/nuevo/page.tsx:39,72`,
  `components/wizard/step-basicos.tsx:130`, `components/expenses/new-expense-dialog.tsx:142,152,162,179,191,200,214,240,245`,
  `components/expenses/edit-expense-dialog.tsx:96,102,110,130,138,144`, `components/providers/campos-cuenta.tsx:37,86`,
  `components/providers/new-provider-dialog.tsx:39`, `components/providers/edit-provider-form.tsx:28`,
  `components/departures/add-reservation.tsx:159,166`, `components/expenses/expenses-filters.tsx:28`.
- **Arreglo (uno solo, global):** en `app/globals.css` dentro de `@layer base`:
  `select { min-width: 0; max-width: 100%; }` y en los de formulario agregar `w-full`. Mejor: crear
  `components/ui/native-select.tsx` con `"flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base sm:text-sm"`
  y reemplazar los ~30 usos.

### R-07 · MEDIO (solo 320px) · Pestaña **Liquidación** — "Fijar tasa de cierre" se sale de la tarjeta
- **Visto:** en iPhone SE el documento mide **363px**: el grupo de botones "Modo de liquidación · Fijar tasa de
  cierre" no se parte. `capturas/iphonese/caminos_39fc…_tab_liquidacion.png` (y el camino 5309…).
- **Causa:** `components/departures/tabs/liquidacion-tab.tsx:62` — `flex gap-2 flex-wrap shrink-0`; el `shrink-0`
  impide que el contenedor se encoja por debajo del ancho de los dos botones juntos.
- **Arreglo:** `className="flex w-full gap-2 flex-wrap sm:w-auto sm:shrink-0"` y a los botones `flex-1 sm:flex-none`.

### R-08 · BAJO · Habitaciones y Cenas — "Excel solo de <Hotel largo>" se sale en pantallas chicas
- **Visto:** SE: documento **332px**, el botón "Excel solo de Hotel Ferramenteiro Portomarin" se corta fuera.
  `capturas/iphonese/caminos_39fc…_tab_habitaciones.png`.
- **Causa:** `Button` base tiene `whitespace-nowrap` (`components/ui/button.tsx:8`) y el texto incluye el nombre del
  proveedor: `components/departures/rooming-board.tsx:529`, `components/departures/menus-board.tsx:490`.
- **Arreglo:** texto corto "Excel de este hotel" / "Excel de este restaurante" (el nombre ya está en el título de la
  tarjeta) o `className="h-auto min-h-8 whitespace-normal text-left"` en ese `Button`.

### R-09 · ALTO · Diálogos (base `components/ui/dialog.tsx`) — el contenido se sale por la derecha y las filas quedan separadas por huecos
- **Visto (capturas en `capturas/dialogos/`, iPhone 13):**
  - **Editar inscripción** (ficha del peregrino) y **Inscribir peregrino** (pestaña Peregrinos): el `<select>` del camino
    y todo el formulario se salen por la derecha; el texto "Paga en pesos colombianos (aplica recálculo 1 mes ant…" queda
    cortado y la flecha de los select no se ve. `ficha-editar-inscripcion-1.png`, `inscribir-1.png`.
  - **Menú del restaurante** (pestaña Cenas → "Menú"): la nota, "Copiar el de la última vez (…)" y los botones
    "+ Bebida" se salen por la derecha. `menu-editor-1.png`.
  - En casi todos, el título queda arriba y un **hueco grande** antes del primer campo (y huecos entre filas):
    `agregar-cuenta-1.png`, `nueva-reserva-1.png`, `inscribir-1.png`, `modo-liquidacion-1.png`, `tasa-cierre-1.png`.
- **Causa:** `components/ui/dialog.tsx:33` — el contenido es `fixed inset-0 grid gap-4 …` en móvil: (1) la columna
  implícita del grid es `auto`, así que se estira al ancho del hijo más ancho (un select con opción larga o un botón
  `whitespace-nowrap`) → todo el diálogo desborda; (2) con altura fija (`inset-0`) el grid reparte el alto sobrante
  entre las filas (`align-content: normal` = stretch) → huecos.
- **Arreglo (una línea, arregla todos los diálogos):** agregar a la clase base
  `grid-cols-[minmax(0,1fr)] content-start` (y `pb-[max(1rem,env(safe-area-inset-bottom))]`). Además `w-full` en los
  select de esos diálogos (ver R-06): `components/pilgrims/edit-registration-dialog.tsx:84,122`,
  `components/departures/add-pilgrim-to-departure.tsx:91`.

### R-10 · MEDIO · Diálogos con scroll dentro del scroll (formularios largos)
- **Visto:** **Nueva cuenta de cobro**, **Nueva reserva**, **Pago de reserva**, **Etapas de la ruta**, **Plan de pagos**,
  **Envío masivo de contratos**: el diálogo ya ocupa toda la pantalla y tiene scroll, pero el formulario adentro tiene
  su propio `max-h-[70vh] overflow-y-auto`. En iPhone queda una caja que corta los campos a mitad ("SWIFT / BIC"
  cortado, `agregar-cuenta-2.png`; "Habitaciones" cortado, `nueva-reserva-1.png`) y un hueco vacío debajo; hay que
  acertarle al área correcta para hacer scroll y el botón Guardar queda escondido al final de la caja interna.
- **Causa:** `components/providers/payment-accounts-card.tsx:73`, `components/departures/add-reservation.tsx:155`,
  `components/departures/bloque-pago-reserva.tsx:175`, `components/routes/editor-etapas.tsx:74`,
  `components/pilgrims/payment-plan-card.tsx:205`, `components/contracts/envio-masivo.tsx:100,129`.
- **Arreglo:** que el límite interno aplique solo desde `sm`: `sm:max-h-[70vh] sm:overflow-y-auto` (idem 75vh, 55vh,
  45vh, 40vh). En móvil el que desplaza es el propio diálogo.

### R-11 · MEDIO · Diálogos con `max-h-[90vh]`/`[85vh]` sin prefijo — en el celular se ve la página detrás abajo
- **Visto:** **Menú del restaurante** y **Rooming list para Hotel Roma** (Enviar a hotel) ocupan 597 de 664px: abajo
  asoma la lista de peregrinos detrás del overlay, parece roto. `menu-editor-2.png`, `enviar-proveedor-1.png`.
- **Causa:** `components/departures/menu-editor.tsx:244`, `components/departures/enviar-proveedor-dialog.tsx:127`
  (`max-h-[90vh]`), `components/departures/gmail-thread-dialog.tsx:179` (`max-h-[85vh]`).
- **Arreglo:** `sm:max-h-[90vh]` / `sm:max-h-[85vh]` (el `overflow-y-auto` ya lo trae la base).

### R-12 · ALTO · **Plan de pagos** (ficha del peregrino → Editar) — no se ve el año de la cuota ni el monto completo
- **Visto:** cada cuota en una fila de 12 columnas: nombre 5/12, fecha 3/12 (≈70px), monto 3/12. La fecha se ve
  "17 /09/" sin año, el monto con las flechas encima. `capturas/dialogos/ficha-plan-pagos-1.png`.
- **Causa:** `components/pilgrims/payment-plan-card.tsx:210-235` — `grid grid-cols-12` sin variante móvil.
- **Arreglo:** `grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-12` con: label `col-span-2 sm:col-span-5`, fecha
  `col-span-1 sm:col-span-3`, monto `col-span-1 sm:col-span-3` (queda fecha+monto en la 2ª línea), botón quitar
  `h-10 w-10 col-start-2 row-start-1 sm:col-span-1`. Mismo patrón en
  `components/departures/reservation-payment-schedule-editor.tsx:103` (date `col-span-5`, h-8 text-xs).

### R-13 · ALTO · **Etapas de la ruta** (Configuración → Rutas → Etapas) — tabla de 7 columnas ilegible
- **Visto:** en 390px las columnas quedan de ~40px: "Pre", "Me", "Ma", "6 hore", el día y los km vacíos (no se ve el
  número). No se puede editar una etapa desde el iPhone. `capturas/dialogos/editor-etapas-1.png`. Botón "Quitar etapa"
  24×24px.
- **Causa:** `components/routes/editor-etapas.tsx:75-140` — `<table>` crudo dentro de un diálogo `max-w-4xl`.
- **Arreglo:** en móvil una tarjeta por etapa: `<div className="sm:hidden space-y-3">` con
  `grid grid-cols-2 gap-2` (Día | Tipo en la 1ª fila, Desde | Hasta, Km | Horas, y "Quitar" `h-10` a lo ancho); la
  tabla actual `hidden sm:table`.

### R-14 · ALTO · Tablas apiladas (`.tabla-apilable`) — celdas con varios elementos se desparraman y el teléfono queda cortado
- **Visto:** en `/peregrinos` "Email / Teléfono" pone el correo al medio y el teléfono se sale de la tarjeta y queda
  cortado ("LIS.CALLE@hotmail.com 315578769…", "ninamazo89@gmail.com 314757350…"; `capturas/iphone13/repetidas/peregrinos.png`).
  En Reservas, "Fecha" muestra entrada al centro y salida a la derecha; "Proveedor / Lugar" nombre centrado + íconos +
  lugar al borde; "Repartidos  Menú … 0/15". En Liquidación "Pagó en pesos  —  + EUR 128,00 en EUR". En Proveedores
  "Contacto  —  correo". Se lee como tres columnas sin etiqueta.
- **Causa:** `app/globals.css:97-106` — `.tabla-apilable td { display:flex; justify-content:space-between }` y cada hijo
  de la celda es un ítem flex más, sin `flex-wrap` ni `min-width:0`.
- **Arreglo (CSS, arregla todas las tablas):**
  ```css
  .tabla-apilable td[data-label] { display:grid; grid-template-columns:auto minmax(0,1fr); column-gap:.75rem; align-items:baseline; }
  .tabla-apilable td[data-label]::before { grid-row: 1 / span 20; }
  .tabla-apilable td[data-label] > * { grid-column:2; justify-self:end; max-width:100%; overflow-wrap:anywhere; }
  ```
  (los hijos se apilan a la derecha, uno bajo otro, y los correos/teléfonos largos parten línea).

### R-15 · MEDIO · Reservas — la tarjeta se titula con el número de día ("0", "1", "3"…) y no con el proveedor
- **Visto:** cada tarjeta arranca con un "0" / "1" / "—" grande; el nombre del hotel queda a mitad de tarjeta.
  `capturas/iphone13/caminos_39fc…_tab_reservas.png`.
- **Causa:** `.tabla-apilable td:first-child` es el título y la primera columna de `components/departures/tabs/reservas-tab.tsx`
  es "Día".
- **Arreglo:** en la primera celda renderizar `Día {n} · {proveedor}` en móvil (`<span className="sm:hidden">Día {d} · {prov}</span><span className="hidden sm:inline">{d}</span>`),
  o mover la columna Proveedor a la primera posición.

### R-16 · MEDIO (320px) · Reservas — "Importar desde correo" se corta por la izquierda
- **Visto:** iPhone SE: la fila de acciones está alineada a la derecha y sin `flex-wrap`; el botón de la izquierda se
  sale por el borde izquierdo ("…portar desde correo"). `capturas/iphonese/caminos_39fc…_tab_reservas.png`.
- **Causa:** `components/departures/tabs/reservas-tab.tsx:83` — `flex justify-end gap-2`.
- **Arreglo:** `flex flex-wrap justify-end gap-2` (o `grid grid-cols-2 gap-2 sm:flex sm:justify-end`).

### R-17 · ALTO (a verificar en iPhone real) · `/firmar/<token>` — el contrato va en un `<iframe>` de PDF
- **Visto:** "Paso 1 · Lee el contrato" es un iframe de 560px con el PDF. En WebKit sale en blanco
  (`capturas/iphone13/publicas/firmar_6607…png`); en Safari iOS un PDF dentro de iframe se muestra solo como la
  primera página sin poder desplazarse dentro, así que el peregrino no puede leer el contrato completo antes de
  firmar. El enlace "Descárgalo en PDF" es de 104×16px y con `download`.
- **Causa:** `app/firmar/[token]/form-firma.tsx:123-134`.
- **Arreglo:** en móvil reemplazar el iframe por un botón grande
  `<a href={`/api/pdf/contrato/publico/${token}`} target="_blank" rel="noopener" className="block w-full rounded px-4 py-3 text-center" …>Abrir el contrato completo (PDF)</a>`
  (`sm:hidden`) y dejar el iframe `hidden sm:block`. Quitar `download` del enlace (en iOS abre el visor, que es lo que se quiere).

### R-18 · MEDIO · Botones y enlaces demasiado chicos para el dedo (< 32px; Apple recomienda 44)
Medido por el informe en iPhone 13 (`capturas/iphone13/informe.json`, campo `botonesChicos`):
- Habitaciones: "no duerme acá" **96×20px** con texto de 10px, pegado al nombre (`components/departures/rooming-board.tsx:441-447`).
  → `className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs …"` y el chip padre `py-1`.
- Cenas: "no cena" 63×24, copiar enlace 20×20 (ver R-02).
- Íconos de lápiz / enlace / PDF en Reservas, Viáticos, Pagos de la ficha: **28×28** (`Button size="icon" className="h-7 w-7"` y
  similares). → `h-10 w-10 sm:h-7 sm:w-7`.
- "Quitar etapa" 24×24 (editor de etapas).
- Contratos: checkbox "Enviar como prueba a…" **12×12** y el input de correo `h-7 text-xs min-w-[200px]`
  (`components/pilgrims/contract-card.tsx:217-227`). → checkbox `h-5 w-5`, input `h-10 w-full sm:h-7 sm:w-auto sm:min-w-[200px]`.
- Reservas: enlaces "Menú" y "0/15" de 16px de alto; "Abrir la ficha →" 86×16; nombres de peregrino como enlace de 20px.
  → `inline-block py-2` (o `py-1.5 -my-1.5` para no mover el diseño).
- Selector de tasa "1 € = 3.586 COP" 28px y "← Caminos" 18px en la cabecera del camino. → `min-h-9 inline-flex items-center`.
- Checkbox "No voy a cenar esta noche" 12×12 en el menú público (`app/menu/[token]/form-menu.tsx:285-286`) y las
  casillas de consentimiento en `/firmar` (`app/firmar/[token]/form-firma.tsx:143,147`). La etiqueta envuelve la casilla,
  así que se puede tocar el texto; igual subirlas a `style={{ width: 20, height: 20 }}` y `py-2` en el label.

### R-19 · MEDIO · Habitaciones, Cenas y Gastos — páginas eternas (Habitaciones ~18.700px, Gastos ~19.600px de alto)
- **Visto:** Habitaciones del camino de abril: **~18.700px CSS** (22 pantallas) porque todas las noches vienen abiertas y
  cada noche repite los 15 chips de "Sin habitación" más cada cama como `<select>`.
  `capturas/iphone13/caminos_39fc…_tab_habitaciones.png`. Gastos: **~19.600px** (`capturas/iphone13/repetidas/gastos.png`).
- **Causa:** `components/departures/rooming-board.tsx` y `menus-board.tsx` renderizan cada noche expandida;
  `app/(app)/gastos/page.tsx` muestra saldos por cuenta + pendientes + todos los movimientos seguidos.
- **Arreglo:** noches como `<details>` cerrados en móvil salvo la primera incompleta (el encabezado ya muestra "0/15");
  en Gastos, "Pendiente por pagar" y "Saldo por cuenta" plegables (`<details className="sm:open">` no existe → usar
  estado con `useMediaQuery` o `open` solo en desktop) y paginar movimientos de a 20.

### R-20 · MEDIO · Dashboard de Naty — "Próximos cobros": la fecha y "vencida" se montan con el nombre del camino cortado
- **Visto:** cada fila muestra "Andrea Consuelo P…  EUR 22,00 / Camino Francés — Abri…08 de sept de 2026 · 21d vencida":
  el nombre del camino se corta y la fecha quedan pegados, y el nombre del peregrino también se corta.
  `capturas/iphone13/dashboard_naty.png` (segunda pantalla).
- **Causa:** `components/pilgrims/upcoming-payments-card.tsx:27-36` — la columna derecha (`shrink-0`) lleva monto + fecha
  larga y le roba ancho a la izquierda.
- **Arreglo:** derecha solo el monto; la fecha/"vencida" como segunda línea de la izquierda:
  `<div className="text-xs … truncate">{departure_name}</div><div className={`text-xs ${color}`}>{fecha}{estado}</div>`.

### R-21 · MEDIO · Viáticos — la descripción queda en una columna de 3 palabras
- **Visto:** "Vuelo Med-Madrid-Med (Naty + Nico)" y sus notas se parten en 4–7 líneas de ~130px porque a la derecha van
  el monto EUR+COP y el lápiz. `capturas/iphone13/caminos_39fc…_tab_viaticos.png`.
- **Causa:** `components/departures/tabs/viaticos-tab.tsx:115` (`flex items-center justify-between`) + `:148`
  (`text-right shrink-0 flex`).
- **Arreglo:** `flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between` en la fila y en la derecha
  `flex items-center justify-between sm:justify-end gap-1`.

### R-22 · MEDIO · Wizard → Básicos → "Días planificados": km y fecha se parten letra a letra
- **Visto:** cada día pone chip + tipo (w-24) + tramo + "· 22.2 km" en una fila y la fecha a la derecha; en 390px la
  fecha queda "24 de / abr / de / 2027" y el km "· 22.2 / km". `capturas/iphone13/repetidas/caminos_39fc…_wizard.png`.
- **Causa:** `components/wizard/step-basicos.tsx:249-258`.
- **Arreglo:** `grid grid-cols-[auto_1fr_auto] gap-x-2 items-baseline`; el tipo `hidden sm:inline`; el km en una segunda
  línea bajo el tramo; fecha `whitespace-nowrap` con `formatDate` corto (dd/mm).

### R-23 · BAJO · Qué hay que pagar — la lista "17 pagos sin datos completos" no se sabe qué etiqueta es de quién
- **Visto:** "falta medio de pago" salta de línea a veces al lado y a veces debajo del proveedor.
  `capturas/iphone13/repetidas/pagos_proveedores.png`.
- **Causa:** `app/(app)/pagos-proveedores/page.tsx:238` (`flex justify-between gap-3 flex-wrap`).
- **Arreglo:** `flex flex-col sm:flex-row sm:justify-between` + separador `border-b py-1.5` por ítem.

### R-24 · BAJO · Montos EUR · COP que parten línea feo
- **Visto:** en Resumen "Costo por peregrino pagante" y "Costo TOTAL prorrateado", el valor queda "EUR 878,08 ·" arriba y
  "$ 3.148.807" abajo alineado raro; "Camas equipo (2 × EUR 878,08) ÷ 13" parte el 13 solo.
  `capturas/iphone13/caminos_39fc…_tab_resumen.png`.
- **Causa:** `components/ui/eur-cop.tsx:33-35` — los spans de EUR y de "· COP" no tienen `whitespace-nowrap`, así que
  el navegador parte en los espacios internos ("·" queda solo al final de la línea).
- **Arreglo:** `<span className="whitespace-nowrap">{formatEUR(eur)}</span>` y
  `<span className="whitespace-nowrap text-[0.85em] … ml-1">· {formatCOP(cop)}</span>`: el salto queda limpio entre EUR y COP.

### R-25 · BAJO · Varios cosméticos
- Liquidación / Pagos: filas "Registrar" / "Cerrar" con la etiqueta de la columna de acciones pero sin contenido o
  con un solo botón (`capturas/iphone13/caminos_39fc…_tab_liquidacion.png`). → no poner encabezado de texto en la
  columna de acciones (`<TableHead />` vacío) para que `.tabla-apilable` la trate como fila de botones.
- Ficha del peregrino: la zona de pasaporte dice "Arrastrá el pasaporte acá o hacé clic" (`components/pilgrims/passport-upload.tsx:172`)
  → en móvil "Tocá para subir el pasaporte (foto o PDF)".
- Ficha del peregrino: en móvil lo más usado (Pagos: "Nuevo pago", plan de pagos) queda después de Contacto,
  Emergencia y Pasaporte. → `order-first lg:order-none` en la columna de inscripción/pagos.
- Dashboard de Naty: 10 tarjetas de indicadores una debajo de otra (`app/(app)/dashboard/naty/page.tsx:66,77`
  `grid gap-4 sm:grid-cols-2`) → `grid-cols-2 gap-3` en móvil con `text-xl` en el valor.
- TRM: el historial es una tarjeta por día con dos datos (`capturas/iphone13/repetidas/trm.png`) → `<Table apilar={false}>`
  de 3 columnas cabe bien en 390px.
- Configuración: el bloque de código SQL "update elcamino.profiles set app_role =" se corta
  (`capturas/iphone13/repetidas/configuracion.png`) → `whitespace-pre-wrap break-all`.
- Cabecera del camino: el `<summary>` "Plata del camino" muestra el triángulo nativo de Safari además del diseño
  (`app/(app)/caminos/[id]/page.tsx:133`) → agregar `[&::-webkit-details-marker]:hidden` como ya tiene el banner de alertas.
- Inputs con `text-sm` (14px) y `text-xs` (12px; `rooms-editor.tsx`, `menu-editor.tsx`, `rooming-board.tsx`,
  `reservation-payment-schedule-editor.tsx`, `import-reservation-from-email.tsx`): no hacen zoom gracias a
  `maximum-scale=1`, pero 12px es chico para escribir en el celular → `text-base sm:text-sm` en `components/ui/input.tsx:12`,
  `select.tsx:18`, `textarea.tsx:11` y quitar los `text-xs` de inputs.
- Menú público (`/menu/c/<token>?yo=…`): los encabezados de sección ("SEGUNDO (PLATO FUERTE)") van pegados a la
  última opción de la sección anterior → `mt-4` en el título de cada curso (`app/menu/[token]/form-menu.tsx`).

### R-26 · BAJO (a verificar en iPhone real) · Descargas de Excel/PDF en la app de pantalla de inicio
- Los botones Habitaciones / Cenas / Peregrinos / "Excel solo de…" / "Informe de pagos (PDF)" son `<a download>`.
  En Safari normal abren la hoja de descarga; en modo standalone (ícono en pantalla de inicio) iOS abre el archivo
  en un visor dentro de la app y a veces no deja volver ni compartir. Probar en el iPhone de Nico; si pasa, abrir
  esos enlaces con `target="_blank"` (iOS los manda a Safari, desde donde se comparte a WhatsApp/Archivos).

## Rutas revisadas

"iPhone SE" de Playwright 1.48 es el **SE de 1ª generación, 320×568** (el peor caso; un SE 2/3 mide 375×667, cerca
del 13). ✓ = sin problemas de peso; ✗ = tiene hallazgo (ver columna). Camino A = `39fc6fa6…` (Francés abril 2027,
con datos); camino B = `530955f7…` (Portugués, casi vacío: todas sus pestañas ✓ salvo las mismas causas que A).

| Ruta | iPhone 13 (390) | SE (320) | Hallazgos |
|---|---|---|---|
| `/login` (sin sesión) | ✓ | ✓ | inputs 14px (R-25) |
| `/` → `/dashboard/naty` | ✗ | ✗ | R-20, R-25 |
| `/dashboard/nico` | ✓ | ✓ | — |
| `/caminos` | ✓ | ✓ | — |
| `/caminos/nuevo` | ✓ | ✗ (353px) | R-06 |
| `/peregrinos` | ✗ | ✗ | R-14 |
| `/pagos` | ✓ | ✓ | — |
| `/pagos-proveedores` | ✗ | ✗ | R-23 |
| `/proveedores` | ✗ | ✗ | R-14 (contacto) |
| `/proveedores/<id>` | ✓ | ✓ | diálogo cuenta R-10 |
| `/gastos` | ✗ | ✗ | R-19 |
| `/trm` | ✓ | ✓ | R-25 |
| `/configuracion` | ✗ | ✗ | R-13 (etapas), R-25 |
| `/peregrinos/<id>` (ficha) | ✗ | ✗ | R-09, R-12, R-18, R-25 |
| `/peregrinos/<id>/carta/<reg>` | ✓ | ✓ | — |
| camino · cabecera y pestañas (todas) | ✗ | ✗ | R-03, R-04 |
| camino · `?tab=resumen` | ✓ | ✓ | R-24 |
| camino · `?tab=pagos` | ✗ | ✗ (328px) | R-05 |
| camino · `?tab=liquidacion` | ✗ | ✗ (363px) | R-07, R-14, R-25 |
| camino · `?tab=peregrinos` | ✓ | ✓ | diálogo Inscribir R-09 |
| camino · `?tab=contratos` | ✗ | ✗ | R-18 |
| camino · `?tab=presupuesto` | ✓ | ✓ | — |
| camino · `?tab=viaticos` | ✗ | ✗ | R-21 |
| camino · `?tab=reservas` | ✗ | ✗ | R-14, R-15, R-16, R-10 |
| camino · `?tab=habitaciones` | ✗ | ✗ (332px) | R-08, R-18, R-19 |
| camino · `?tab=cenas` | ✗ | ✗ | R-02, R-11 |
| camino · `?tab=gastos` | ✓ | ✓ | — |
| camino · `?tab=documento` | ✓ | ✓ | — |
| camino · `?tab=videos` | ✓ | ✓ | — |
| `/caminos/<id>/wizard` | ✗ | ✗ (353px) | R-06, R-22 |
| `/video/<token>?vista=equipo` | ✓ | ✓ | — |
| `/registro/<token>` | ✗ (414px) | ✗ (414px) | **R-01** |
| `/carta/<token>` | ✓ | ✓ | — |
| `/menu/c/<token>` (lista) | ✓ | ✓ | — |
| `/menu/c/<token>?yo=<reg>` | ✓ | ✓ | R-18, R-25 (menores) |
| `/firmar/<token>` (firmado) | ✓ | ✓ | — |
| `/firmar/<token>` (por firmar) | ✗ | ✗ | **R-17**, R-18 |
| `/viaje/<token>` | ✓ | ✓ | — |

Diálogos abiertos (solo mirar, cerrados con Escape; `capturas/dialogos/*-1.png` arriba y `*-2.png` al final):
Nuevo pago (camino y ficha), Pago de reserva, Nueva reserva, Importar desde correo, Agregar ítem, Agregar viático,
Menú del restaurante, Rooming list (Enviar a hotel), Modo de liquidación, Fijar tasa de cierre, Envío masivo de
contratos, Inscribir peregrino, Penalidad, Editar inscripción, Editar peregrino, Plan de pagos, Nuevo movimiento,
Nuevo peregrino, Nuevo proveedor, Agregar cuenta, Etapas de la ruta, Nueva ruta. Todos: R-09; además R-10/R-11/R-12/R-13
donde se indica.

## Resumen

| Severidad | Cantidad | Hallazgos |
|---|---|---|
| ALTO | 7 | R-01 registro público desborda · R-02 cenas: controles fuera de pantalla · R-09 diálogos desbordan (base) · R-12 plan de pagos · R-13 etapas · R-14 tablas apiladas cortan datos · R-17 contrato en iframe |
| MEDIO | 14 | R-03 · R-04 · R-05 · R-06 · R-07 · R-10 · R-11 · R-15 · R-16 · R-18 · R-19 · R-20 · R-21 · R-22 |
| BAJO | 5 | R-08 · R-23 · R-24 · R-25 · R-26 |

**Orden sugerido de arreglo (mayor impacto por línea tocada):** R-09 (una clase en `dialog.tsx`) → R-14 (CSS en
`globals.css`) → R-06 (`select` global) → R-01 (`minWidth:0` en el formulario público) → R-10/R-11 (prefijos `sm:`)
→ R-02, R-12, R-13 (vistas móviles de tarjeta) → R-17 → R-03/R-04 (cabecera y pestañas del camino) → el resto.
