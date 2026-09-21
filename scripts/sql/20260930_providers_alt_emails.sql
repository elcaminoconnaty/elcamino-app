-- Aplicada el 2026-09-21 con apply_migration (proyecto btunvfrxegjwpznlmvjp).
-- Copia de referencia: la base viva es la fuente de verdad.
--
-- Un proveedor negocia desde varias direcciones con el tiempo (el Parador pasó de
-- comercial.santiago2@ a comercial.santiago@) y a veces la cena de un restaurante se
-- habla en el hilo de otro alojamiento (Che Opedrouzo va en el de Pensión Platas).
-- `email` sigue siendo el destinatario del envío; estas son las direcciones extra que
-- se miran al buscar el hilo de Gmail de una reserva.
alter table providers
  add column if not exists alt_emails text[] not null default '{}';

comment on column providers.alt_emails is
  'Direcciones adicionales del proveedor. Solo se usan para encontrar hilos de Gmail; el envío sigue saliendo a email.';

-- Datos que se corrigieron junto con la migración (sin borrar ningún correo existente):
--   Che Opedrouzo   -> email pensionplatas@hotmail.com (estaba vacío)
--   Pensión Platas  -> email pensionplatas@hotmail.com (estaba vacío)
--   Pazo Santa María-> email reservas@pazosantamaria.com + alt info@pazosantamaria.com
--   Parador Santiago (ficha con correo) -> conserva comercial.santiago2@, alt comercial.santiago@
--   Parador Santiago (ficha sin correo) -> email comercial.santiago@, alt comercial.santiago2@
