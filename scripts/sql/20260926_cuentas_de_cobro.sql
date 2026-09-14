-- Cuentas de cobro por proveedor (2026-09-26): un proveedor puede cobrar de varias formas
-- y, camino a camino, la negociación cambia cuál se usa. La reserva apunta a una de ellas,
-- así el informe de un camino viejo no se corrompe cuando el hotel cambia de cuenta.
-- Aplicada en producción con apply_migration del conector MCP. Copia de referencia.
create table if not exists public.provider_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  alias text,
  method text not null default 'transferencia'
    check (method in ('transferencia','bizum','tarjeta','efectivo','booking','otro')),
  currency text not null default 'EUR',
  fx_per_eur numeric,
  bank_name text,
  account_holder text,
  iban text,
  swift_bic text,
  bizum_phone text,
  notes text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.provider_payment_accounts.alias is
  'Cómo la reconoce Naty: "Cuenta habitual", "Camino Francés Sep-2026", "Bizum del dueño".';
comment on column public.provider_payment_accounts.fx_per_eur is
  'Unidades de `currency` por 1 EUR. Solo para cuentas que no cobran en euros; el informe lo usa para mostrar el importe a girar en la moneda real.';

create index if not exists provider_payment_accounts_provider_idx
  on public.provider_payment_accounts(provider_id);
create unique index if not exists provider_payment_accounts_default_idx
  on public.provider_payment_accounts(provider_id) where is_default;

create trigger trg_touch_updated_at before update on public.provider_payment_accounts
  for each row execute function public.touch_updated_at();

alter table public.provider_payment_accounts enable row level security;
create policy provider_payment_accounts_team_all on public.provider_payment_accounts
  for all to authenticated using (is_team_member()) with check (is_team_member());

-- Lo que ya estaba cargado en la ficha del proveedor pasa a ser su cuenta predeterminada.
insert into public.provider_payment_accounts
  (provider_id, alias, method, bank_name, account_holder, iban, swift_bic, bizum_phone, notes, is_default)
select
  id,
  'Cuenta habitual',
  coalesce(
    payment_method_default,
    case when iban is not null then 'transferencia'
         when bizum_phone is not null then 'bizum'
         else 'otro' end
  ),
  bank_name, account_holder, iban, swift_bic, bizum_phone, payment_notes, true
from public.providers
where coalesce(payment_method_default, bank_name, account_holder, iban, swift_bic, bizum_phone, payment_notes) is not null;

-- La reserva manda: acá queda la negociación de ESTE camino con ESTE proveedor.
alter table public.reservations
  add column if not exists payment_account_id uuid references public.provider_payment_accounts(id) on delete set null,
  add column if not exists payment_terms text,
  add column if not exists payment_reference text;

comment on column public.reservations.payment_terms is
  'La condición pactada en texto: "30% al reservar, resto 7 días antes". El detalle con fechas y montos vive en reservation_payment_schedule.';
comment on column public.reservations.payment_reference is
  'Qué poner en el concepto de la transferencia para que el proveedor la identifique.';

-- Cada pago guarda a qué cuenta se giró de verdad: si mañana cambian el IBAN, el
-- histórico no se reescribe solo.
alter table public.provider_payments
  add column if not exists payment_account_id uuid references public.provider_payment_accounts(id) on delete set null,
  add column if not exists paid_to jsonb;

-- Las columnas de pago en `providers` quedan de respaldo de la migración de arriba.
-- Ya no se escriben desde la app; se pueden borrar cuando esto lleve un camino andando.
comment on column public.providers.iban is 'OBSOLETO: usar provider_payment_accounts. Se conserva como respaldo de la migración.';
