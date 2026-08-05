export type Route = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  days: number | null;
  nights: number | null;
  km: number | null;
  active: boolean;
};

export type Departure = {
  id: string;
  route_id: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  status: "planning" | "open" | "closed" | "in_progress" | "finished" | "cancelled";
  base_price_eur: number;
  notes: string | null;
  trm_frozen_at_date: string | null;
  trm_frozen_value: number | null;
};

export type Pilgrim = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  document_id: string | null;
  birth_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  dietary_notes: string | null;
  notes: string | null;
};

export type Registration = {
  id: string;
  departure_id: string;
  pilgrim_id: string;
  status: "pre_inscrito" | "inscrito" | "confirmado" | "viajado" | "cancelado";
  total_eur: number;
  discount_eur: number;
  paid_in_cop_originally: boolean;
  frozen_trm_eur_cop: number | null;
  frozen_trm_date: string | null;
  notes: string | null;
};

export type TrmRate = { date: string; eur_cop: number; set_by: string | null; notes: string | null };

export type PilgrimPayment = {
  id: string;
  registration_id: string;
  paid_at: string;
  amount: number;
  currency: "EUR" | "COP" | "USD";
  trm_eur_cop: number | null;
  usd_eur_rate: number | null;
  amount_eur: number | null;
  method: string | null;
  account: string | null;
  reference: string | null;
  receipt_pdf_path: string | null;
  proof_path: string | null;
  notes: string | null;
};

export type Provider = {
  id: string;
  name: string;
  type: "alojamiento" | "transporte" | "cenas" | "equipaje" | "seguro" | "guia" | "agencia" | "otro";
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  notes: string | null;
  active: boolean;
};

export type Reservation = {
  id: string;
  departure_id: string;
  provider_id: string;
  type: string;
  location: string | null;
  day_number: number | null;
  check_in: string | null;
  check_out: string | null;
  beds_count: number | null;
  accommodation_type: string | null;
  estimated_cost_eur: number;
  confirmed_cost_eur: number | null;
  status: "presupuestado" | "contactado" | "reservado" | "confirmado" | "pagado" | "cancelado";
  confirmation_ref: string | null;
  notes: string | null;
};

export type ProviderPayment = {
  id: string;
  provider_id: string;
  reservation_id: string | null;
  departure_id: string | null;
  paid_at: string;
  amount: number;
  currency: "EUR" | "COP" | "USD";
  trm_eur_cop: number | null;
  usd_eur_rate: number | null;
  amount_eur: number | null;
  method: string | null;
  account: string | null;
  reference: string | null;
  receipt_path: string | null;
  notes: string | null;
};

export type BudgetItem = {
  id: string;
  departure_id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string | null;
  estimated_unit_cost_eur: number;
  confirmed_unit_cost_eur: number | null;
  estimated_total_eur: number;
  confirmed_total_eur: number;
  provider_id: string | null;
  reservation_id: string | null;
  status: "estimado" | "confirmado" | "pagado" | "cancelado";
  notes: string | null;
  position: number;
};

export type Expense = {
  id: string;
  expense_date: string;
  kind: "operativo" | "personal";
  category: string;
  description: string | null;
  amount: number;
  currency: "EUR" | "COP" | "USD";
  trm_eur_cop: number | null;
  usd_eur_rate: number | null;
  amount_eur: number | null;
  departure_id: string | null;
  payment_method: string | null;
  account: string | null;
  receipt_path: string | null;
  notes: string | null;
};

export type PilgrimBalance = {
  registration_id: string;
  departure_id: string;
  pilgrim_id: string;
  departure_name: string;
  start_date: string | null;
  pilgrim_name: string;
  total_eur: number;
  discount_eur: number;
  net_total_eur: number;
  paid_eur: number;
  pending_eur: number;
  frozen_trm_eur_cop: number | null;
  frozen_trm_date: string | null;
  paid_in_cop_originally: boolean;
  pending_cop_reference: number | null;
  status: string;
};

export type UpcomingInstallment = {
  id: string;
  registration_id: string;
  due_date: string;
  amount_eur: number;
  label: string | null;
  status: "pendiente" | "vencida";
  pilgrim_id: string;
  pilgrim_name: string;
  departure_id: string;
  departure_name: string;
  departure_start_date: string | null;
  days_until_due: number;
  scheduled_amount_eur: number;
};

export type DepartureSummary = {
  departure_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  capacity: number | null;
  pilgrims_count: number;
  expected_revenue_eur: number;
  collected_revenue_eur: number;
  estimated_cost_eur: number;
  confirmed_or_estimated_cost_eur: number;
  paid_to_providers_eur: number;
  operational_expenses_eur: number;
  trm_frozen_at_date: string | null;
  trm_frozen_value: number | null;
};

export type AccountBalance = {
  account: string;
  ingresos_eur: number;
  egresos_proveedores_eur: number;
  egresos_operativos_eur: number;
  egresos_personales_eur: number;
  saldo_eur: number;
};

/** Por cuenta y divisa de origen: cuánto se movió en la moneda original, cuánto
 * quedó en EUR y a qué tasa (para Global 66: pesos pagados → euros recibidos). */
export type AccountCurrencyBreakdown = {
  account: string;
  direction: "ingreso" | "egreso";
  currency: "EUR" | "COP" | "USD";
  movimientos: number;
  monto_origen: number;
  monto_eur: number;
  tasa_promedio: number | null;
};

export type FinancialGlobal = {
  collected_eur: number;
  expected_revenue_eur: number;
  pending_revenue_eur: number;
  paid_providers_eur: number;
  operational_expenses_eur: number;
  personal_withdrawals_eur: number;
  estimated_total_cost_eur: number;
  projected_profit_eur: number;
  realized_operational_profit_eur: number;
  cash_available_eur: number;
};
