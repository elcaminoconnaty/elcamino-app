-- Cenas (2026-09-11): el peregrino cierra su elección con un botón "Enviar" al final,
-- como en el formulario de inscripción. Las elecciones se siguen guardando solas con cada
-- toque; esto marca "ya terminé" y es lo que le dice al equipo que puede mandarle la
-- lista al restaurante.
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.
alter table public.registrations add column menu_submitted_at timestamptz;
