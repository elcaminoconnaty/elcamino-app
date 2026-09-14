-- NIF en la cuenta de cobro (2026-09-28): en España lo piden para identificar al
-- beneficiario del giro, y es lo que después cuadra la transferencia con la factura.
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.
alter table public.provider_payment_accounts
  add column if not exists tax_id text;

comment on column public.provider_payment_accounts.tax_id is
  'NIF del titular (CIF si es sociedad). Va en el informe de pagos, junto al IBAN.';
