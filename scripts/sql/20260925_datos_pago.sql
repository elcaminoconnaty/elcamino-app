-- Informe de pagos pendientes (2026-09-25): cómo se le paga a cada proveedor y desde qué
-- cuenta sale cada reserva, para que Naty haga los pagos con el informe en la mano.
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.
alter table public.providers
  add column payment_method_default text,
  add column bank_name text,
  add column account_holder text,
  add column iban text,
  add column swift_bic text,
  add column bizum_phone text,
  add column payment_notes text;

alter table public.reservations
  add column payment_method text check (payment_method in ('transferencia','bizum','tarjeta','efectivo','booking','otro')),
  add column pay_from_account text;
