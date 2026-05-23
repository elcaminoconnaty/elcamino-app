export const PAYMENT_METHODS = ["Wise", "Bancolombia", "Nequi", "Efectivo", "PayPal", "Transferencia", "Otro"];
export const CURRENCIES = ["EUR", "COP", "USD"] as const;

export const ACCOUNTS = [
  "Efectivo",
  "Bancolombia Naty",
  "Bancolombia Camino",
  "Santander España",
  "Wise",
  "PayPal",
  "Nequi",
  "Otro",
];

export const PROVIDER_TYPES = [
  { value: "alojamiento", label: "Alojamiento" },
  { value: "transporte", label: "Transporte" },
  { value: "cenas", label: "Cenas" },
  { value: "equipaje", label: "Equipaje" },
  { value: "seguro", label: "Seguro" },
  { value: "guia", label: "Guía" },
  { value: "agencia", label: "Agencia" },
  { value: "otro", label: "Otro" },
];

export const RESERVATION_STATUSES = [
  { value: "presupuestado", label: "Presupuestado" },
  { value: "enviado", label: "Enviado (esperando respuesta)" },
  { value: "reservado", label: "Reservado / Confirmado" },
  { value: "pagado", label: "Pagado" },
  { value: "cancelado", label: "Cancelado" },
];

export const BUDGET_STATUSES = [
  { value: "presupuestado", label: "Presupuestado" },
  { value: "enviado", label: "Enviado" },
  { value: "reservado", label: "Reservado" },
  { value: "pagado", label: "Pagado" },
  { value: "cancelado", label: "Cancelado" },
];

export const DEPARTURE_STATUSES = [
  { value: "planning", label: "Planeación" },
  { value: "open", label: "Abierta" },
  { value: "closed", label: "Cerrada" },
  { value: "in_progress", label: "En curso" },
  { value: "finished", label: "Finalizada" },
  { value: "cancelled", label: "Cancelada" },
];

export const REGISTRATION_STATUSES = [
  { value: "pre_inscrito", label: "Pre-inscrito" },
  { value: "inscrito", label: "Inscrito" },
  { value: "confirmado", label: "Confirmado" },
  { value: "viajado", label: "Viajado" },
  { value: "cancelado", label: "Cancelado" },
];

export const EXPENSE_KINDS = [
  { value: "operativo", label: "Operativo" },
  { value: "personal", label: "Personal (Naty)" },
];

export const EXPENSE_CATEGORIES_OPERATIVO = [
  "Marketing",
  "Comisiones",
  "Oficina",
  "Contador",
  "Legal",
  "Bancarios",
  "Software",
  "Transporte trabajo",
  "Reuniones",
  "Otro",
];

export const EXPENSE_CATEGORIES_PERSONAL = [
  "Mercado",
  "Gasolina",
  "Restaurantes",
  "Hogar",
  "Salud",
  "Ocio",
  "Viajes personales",
  "Educación",
  "Familia",
  "Otro",
];

export const BUDGET_CATEGORIES = [
  "Alojamiento",
  "Transporte",
  "Cenas",
  "Comidas",
  "Equipaje",
  "Guía",
  "Seguros",
  "Material",
  "Marketing",
  "Operativo",
  "Contingencia",
  "Otro",
];
