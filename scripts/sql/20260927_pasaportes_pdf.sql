-- El bucket de pasaportes acepta PDF (2026-09-27): muchos consulados y aerolíneas mandan
-- el pasaporte escaneado en PDF, y la subida moría en el Storage antes de llegar a Claude.
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf']
where id = 'passports';
