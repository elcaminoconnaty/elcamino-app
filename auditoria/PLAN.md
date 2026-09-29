# Auditoría total de elcamino-app — 2026-09-29

Pedido de Nico (se fue y no está mirando): auditoría profunda y autosuficiente de TODO —
responsive de verdad en iPhone, front y back bien conectados, **una sola verdad** para cada dato,
y **las cuentas siempre bien hechas**. Arreglar lo que se encuentre. Si se acaba el límite,
retomar desde este archivo.

## Cómo retomar
1. Leer este archivo y los `hallazgos-*.md` de esta carpeta.
2. Mirar la sección "Estado" y seguir por el primer paso sin ✅.
3. El servidor local: `npm run dev -- -p 3011` (lee la base de PRODUCCIÓN: solo mirar).
4. Capturas iPhone (WebKit): `node --env-file=<app>/.env.local <scratchpad>/pw/iphone.mjs <salida> --todas`
   (el script vive en el scratchpad de la sesión: `…/scratchpad/pw/iphone.mjs`, Playwright 1.48.2;
   el WebKit nuevo da "Bus error" en este macOS). Chrome: `scripts/captura-movil.mjs`.

## Nota build
Mientras corre `next dev` en 3011 NO correr `next build` en la misma carpeta (pisan `.next`). Para build:
`git worktree add /tmp/elcamino-build HEAD && cd /tmp/elcamino-build && cp <app>/.env.local . && npm ci && npx next build`.

## Reglas
- Nada de romper plata: cada cambio en cuentas se verifica con SQL contra la base antes y después.
- La base viva es la fuente de verdad del esquema; migraciones con `apply_migration` + copia en `scripts/sql/`.
- Antes de cada commit: `npx tsc --noEmit` y `npx next build`. Commits chicos en español `fix(area): …`.
- Push a main despliega (Railway anda lento hoy: 20–40 min). Verificar que entró.
- No tocar los videos ya verificados salvo que un hallazgo lo exija; al final correr
  `scripts/verificar-videos.mjs` y `scripts/probar-reproduccion-videos.mjs`.

## Estado
- ✅ Arreglo inmediato: header y barra de pestañas eran semitransparentes (bg/80 + backdrop-blur que
  Safari iOS no siempre aplica) → al hacer scroll los botones se veían "montados" sobre el texto. Ahora sólidas.
- ⏳ Revisores en paralelo (cada uno escribe su archivo):
  - `hallazgos-responsive.md` — todas las pantallas en WebKit iPhone 13 y SE, diálogos incluidos.
  - `hallazgos-cuentas.md` — finanzas: vistas SQL, lib/finance, pagos, TRM, penalidades, liquidación,
    proveedores; recomputar con SQL y comparar.
  - `hallazgos-fuente-unica.md` — cálculos duplicados, datos que se leen de dos lados, tipos vs esquema,
    acciones del servidor, código muerto.
  - `hallazgos-base-seguridad.md` — integridad de datos, constraints, RLS, rutas públicas por token, advisors.
- ✅ hallazgos-base-seguridad.md y hallazgos-cuentas.md recibidos.
- ⛔ BLOQUEADO (necesita OK de Nico): aplicar migraciones en la base de producción. El clasificador de
  permisos negó aplicar `scripts/sql/20261002_seguridad_auditoria.sql` ("Modify Shared Resources").
  NO intentar aplicarla por otra vía. Preparar todas las migraciones como archivos y pedir el OK en el informe.
  Hallazgo extra mío: `profiles.app_role` tiene DEFAULT 'nico' + registro abierto ⇒ toda cuenta nueva es equipo.
- ☐ Triage y arreglos (anotar cada uno en "Arreglos hechos").
- ☐ Verificación final (tsc, build, capturas de nuevo, verificadores de videos) y deploy.
- ☐ Informe para Nico (`INFORME.md`) + memoria.

## Arreglos hechos
- (commit 406cd72, push hecho) Header y pestañas sólidos (app/(app)/layout.tsx, app/(app)/caminos/[id]/page.tsx); toasts respetan el borde inferior del iPhone.
- (sin commit aún) Cuentas, código: C-1 Resumen y A-6 dashboard Naty usan pending_settled_eur (única cifra
  de "falta por cobrar"); C-2 PaymentSummary lee v_pilgrim_settlement; A-4 conteo único de inscritos
  (lib/data/inscritos.ts: pagantes/cupo + equipo) en /caminos, dashboards y móvil; Nico ve reservas "enviado";
  M-1 Pagos muestra "Acreditado"; M-6 viáticos sin cancelados y ÷ equipo real; C-5/A-8 cuotas de proveedor
  derivadas de lo pagado (lib/pagos-pendientes/cuotas.ts) en alertas e informe de giros; C-6 effectiveLineTotal
  = regla SQL (verificado: TS 19.545,89 = vista; tarjeta costo/pagante = KPI); M-4/B-2 Excel caja real y
  redondeo; M-10 recibo "Estado del viaje al <hoy>"; M-9 /gastos rotula "todos los caminos".
- ✅ (Nico autorizó "si autorizado") Migración de seguridad APLICADA (`seguridad_auditoria`). Verificado: el equipo ve
  las mismas filas en las 21 vistas que la línea base. La prueba anónima por HTTP la bloqueó el clasificador → pedir a Nico.
- ⛔ Costo contratado: el clasificador bloqueó aplicarlo/prepararlo como definitivo; queda en
  `scripts/sql/20261003_costo_contratado_PROPUESTA.sql`. Pedir OK EXPLÍCITO a Nico solo para ese cambio.
- (sin commit) Responsive globales: diálogos (grid minmax + content-start), tablas apiladas en grid, select max-width,
  inputs 16px en móvil, EUR·COP sin cortes, cabecera del camino compacta (alertas en una línea, comidas OK oculto,
  menú Excel), pestaña activa visible + degradé, Pagos 2 columnas, Liquidación, Reservas (título y wrap), Viáticos,
  próximos cobros, Naty 2 columnas, config SQL con public.profiles, texto de pasaporte.
- ✅ Robustez (agente): 12 arreglos, log en arreglos-robustez.md; SQL pendiente en scripts/sql/20261003_fuente_unica_pendiente.sql (NO aplicado, pedir OK).
- ✅ Checkpoint: rama local `auditoria-2026-09-29`, commit 2924405 (NO publicada; main sigue en 406cd72).
- ⏳ Agentes: responsive restante (arreglos-responsive.md) y revisión del diff (revision-diff.md).
- ☐ Luego: arreglar lo que reporte la revisión; build en worktree; capturas WebKit de todas las rutas; probar
  flujos clave en local sin escribir datos; merge a main + push; verificar deploy; verificadores de videos; INFORME.md.
- ✅ Revisión del diff (revision-diff.md): 0 bloqueantes. Arreglados: MAJOR-1 (pago a proveedor nunca "falla"
  después de guardarse: devuelve aviso), MINOR 1 (aviso plan > costo), 2-3 (teléfonos "+300…" y extensiones),
  5 (encabezado Acreditado), 8 (wizard por-peregrino con la regla única). Pendientes menores: 4 (caja con
  penalidad en COP), 6 (rollback sin verificar), 7 (CURRENT_DATE UTC en vistas: necesita migración).
- ✅ Decisión de Nico: dos cifras de costo ("con los inscritos" = utilidad; "comprometido hoy" = contratos);
  falta por pagar SIEMPRE de contratos (lib/data/costos-contratados.ts); tabla "Utilidad según cuántos
  paguen" (lib/finance.ts tablaPorCupo, componente utilidad-por-cupo-card) — verificada: fila hoy = vista.
- ⏳ Pedido a Nico: costo por HABITACIONES en la base (con N personas, las habitaciones más baratas que
  alcancen; habitación completa aunque quede 1). Espera "sí, costo por habitaciones en la base".
  Abril 2027: Portomarín día 1 tiene Ferramenteiro + Pons Minea a propósito (queda uno al confirmar).
