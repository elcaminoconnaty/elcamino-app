-- Cenas (2026-09-13): un solo enlace por camino para elegir el menú. El peregrino elige
-- su nombre de la lista; el token del camino autoriza la lista y cada escritura se cruza
-- con la inscripción elegida (que tiene que ser de ese camino).
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.
alter table public.departures
  add column menu_token text unique,
  add column menu_token_created_at timestamptz;
