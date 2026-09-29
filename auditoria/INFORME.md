# Informe de la auditoría — 29 de septiembre de 2026

Nico pidió una auditoría total: la plataforma de verdad usable en el iPhone, el front y el back bien
conectados, una sola verdad para cada dato y las cuentas siempre bien hechas. Esto es lo que se hizo,
cómo se verificó y lo que queda en tus manos.

## Cómo se trabajó
Cuatro revisiones independientes, cada una con su archivo en esta carpeta:
- `hallazgos-responsive.md`: todas las pantallas en el motor de Safari, en iPhone 13 y SE.
- `hallazgos-cuentas.md`: cada cifra de plata recalculada en la base y comparada con la pantalla.
- `hallazgos-fuente-unica.md`: cálculos duplicados, conexiones y errores ocultos.
- `hallazgos-base-seguridad.md`: permisos, integridad de datos y enlaces públicos.

Después hubo tres rondas de arreglos (`arreglos-robustez.md`, `arreglos-responsive.md` y los de cuentas
en `PLAN.md`) y una revisión adversarial de todo el cambio (`revision-diff.md`), cuyo hallazgo importante
también se corrigió.

## Lo más grave que se encontró (ya resuelto)
1. **Seguridad.** Con la llave pública de la app, sin iniciar sesión, se leían la lista de habitaciones
   (con pasaportes y teléfonos), los saldos de los peregrinos y el calendario de pagos a proveedores.
   Además, toda cuenta nueva nacía con rol de equipo y el registro estaba abierto.
   → Migración `seguridad_auditoria` aplicada con tu autorización. El equipo ve exactamente las mismas
   filas que antes en las 21 vistas; lo verifiqué contra la línea base.
2. **Pendientes falsos.** A peregrinos ya liquidados, la ficha les mostraba plata por cobrar: a Santiago,
   283 € que en realidad se le habían devuelto. La pestaña Resumen decía que faltaban 1.103 € en
   Septiembre, y eso era diferencia en cambio. → Ahora hay una sola cifra, la liquidada.
3. **Alertas falsas de "Pago VENCIDO"**, por 4.795 €, en reservas ya pagadas. → Las cuotas se dan por
   pagadas según lo que de verdad se le pagó a cada reserva.
4. **Doble toque = pago duplicado** en varios formularios de proveedores y gastos. → Todos los botones de
   guardar se bloquean mientras guardan.
5. **Errores invisibles.** En producción, Next borraba el mensaje real de los errores y solo aparecía
   uno genérico en inglés. → 44 acciones devuelven ahora el mensaje real.
6. **Borrar un peregrino podía borrar sus pagos** si fallaba una consulta. → Ahora aborta antes de tocar nada.

## Cuentas: cómo quedan
- **Falta por cobrar:** una sola cifra en todas partes, a la tasa de cierre cuando el camino está liquidado.
- **Costo del camino, dos cifras con nombre** (decisión tuya):
  - *Costo con los inscritos*: el que da la utilidad, porque tú cancelas las camas sobrantes a tiempo.
  - *Comprometido hoy*: lo contratado y presupuestado; es el peor caso.
- **Falta por pagar:** siempre según lo contratado. La tarjeta, la tabla de Pagos, /gastos, el tablero
  de Naty y el informe de giros dan la misma cifra (Septiembre 2026: 10.053 €).
- **Utilidad según cuántos paguen:** una tabla en la pestaña Resumen, desde hoy hasta llenar el cupo.
  La fila de hoy coincide al centavo con la utilidad del camino.
- **Inscritos:** un solo conteo, "13 / 15 + 2 equipo" (el cupo es de pagantes).
- **Presupuesto, gráfica y costo por pagante:** usan la misma regla que la base. Comprobado:
  19.545,89 € = 19.545,89 €.

## Celular
43 pantallas y los 13 tabs de los 3 caminos revisados en el motor de Safari: todas miden el ancho
exacto de la pantalla, nada se sale y nada se monta. Además:
- Diálogos a pantalla completa y sin huecos.
- Tablas convertidas en tarjetas.
- Formulario de registro del peregrino arreglado (se deslizaba de lado).
- Cenas por tarjeta, plan de pagos, etapas de ruta y botón grande para leer el contrato en /firmar.
- Botones del tamaño del dedo y secciones largas plegadas (Habitaciones pasó de 18.700 px a 3.900 px de alto).
- Las barras de arriba son sólidas (antes se veía el contenido a través).

## Lo que te toca a ti
1. **Supabase → Authentication → Sign In / Providers: desactiva "Allow new users to sign up".**
2. **Costo por habitaciones:** si lo quieres en la base, escribe *"sí, costo por habitaciones en la base"*.
   Con N personas se pagan las habitaciones más baratas que alcancen, completas aunque quede una
   persona sola, más los extras por persona y la tasa turística. En Abril 2027 cambia +407 € con 15 personas.
3. **Datos de Abril 2027:**
   - Hay un "Peregrino de prueba" inscrito que suma 2.790 € al esperado.
   - Dos peregrinos tienen el mismo número de pasaporte (ids `3ea14afc…` y `63200d38…`).
   - Portomarín (día 1) tiene dos alojamientos mientras confirmas Ferramenteiro.
   - Ferramenteiro y Araguaney tienen 22 camas contratadas; con el grupo lleno son 24.
4. **Pruebas en tu iPhone real:**
   - Que los Excel y PDF abran bien desde la app instalada.
   - Que el contrato se lea completo en /firmar.
   - El ensayo de los videos.
5. **Migración opcional preparada** (`scripts/sql/20261003_fuente_unica_pendiente.sql`, no aplicada):
   - Que borrar una inscripción no pueda borrar pagos (FK RESTRICT).
   - Borrado de peregrino en una sola transacción.
   - Llaves contra pagos duplicados.
6. **Menores pendientes:**
   - Las vistas usan la fecha UTC para "vence hoy"; entre las 7 p. m. y la medianoche de Bogotá puede
     diferir un día. Arreglarlo requiere una migración.
   - La prueba de acceso anónimo desde fuera la bloqueó el sistema de permisos. Para confirmarla:
     `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/v_rooming_list?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"`
     tiene que responder error o `[]`.

## Verificación final
- `tsc` limpio y `next build` de producción limpio.
- Recorrido completo de la versión de producción en local con WebKit (iPhone 13), sin errores.
- Videos de los peregrinos: se vuelven a verificar contra producción después del deploy.
