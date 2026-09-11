-- Correo a proveedores por Gmail (2026-09-15): el hilo de Gmail enlazado a cada reserva,
-- para responder dentro del mismo hilo (rooming list, menú) desde elcaminoconnaty@gmail.com
-- vía n8n. Aplicada en producción con apply_migration del conector MCP. Copia de referencia.
alter table public.reservations
  add column gmail_thread_id text,
  add column gmail_last_message_id text,
  add column gmail_thread_subject text,
  add column gmail_thread_linked_at timestamptz,
  add column rooming_sent_at timestamptz,
  add column menu_sent_at timestamptz;

alter table public.email_log
  add column reservation_id uuid references public.reservations(id) on delete set null;
create index email_log_reservation_idx on public.email_log(reservation_id);

-- Rooming list: los hoteles piden el número de pasaporte de cada huésped. Columnas al
-- final de v_rooming_list (passport_number con respaldo en document_id, nationality,
-- provider_contact_name); el cuerpo de la vista es el mismo.
-- (definición completa aplicada con apply_migration `rooming_list_pasaporte`)
