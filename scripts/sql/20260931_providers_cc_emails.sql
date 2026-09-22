-- Aplicada el 2026-09-22 con apply_migration (proyecto btunvfrxegjwpznlmvjp).
-- Copia de referencia: la base viva es la fuente de verdad.
--
-- Direcciones que además RECIBEN copia de cada correo al proveedor. Distinto de
-- alt_emails, que solo sirve para encontrar el hilo de Gmail y no recibe nada: el Parador
-- tiene como alterna una dirección vieja que no debe seguir recibiendo. El Pazo Santa
-- María, en cambio, pide copia a reservas@fontedopicho.com.
alter table providers
  add column if not exists cc_emails text[] not null default '{}';

comment on column providers.cc_emails is
  'Direcciones en copia (CC) de todo correo al proveedor. alt_emails, en cambio, solo se usa para buscar el hilo.';

update providers
  set cc_emails = array['reservas@fontedopicho.com']
where name = 'Pazo Santa Maria' and cc_emails = '{}';
