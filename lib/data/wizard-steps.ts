export type WizardStep = {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
};

export const WIZARD_STEPS: WizardStep[] = [
  { key: "basicos",           label: "1. Básicos",            shortLabel: "Básicos",     description: "Ruta, fechas y N° de peregrinos esperados" },
  { key: "alojamientos",      label: "2. Alojamientos",       shortLabel: "Alojamiento", description: "Una reserva por cada noche del camino" },
  { key: "cenas",             label: "3. Cenas",              shortLabel: "Cenas",       description: "Reservas de restaurante cuando el hotel no incluye cena" },
  { key: "transportes",       label: "4. Transportes grupo",  shortLabel: "Transportes", description: "Tren con grupo, traslados privados, Finisterre" },
  { key: "viaticos-pre",      label: "5. Viáticos antes",     shortLabel: "Pre",         description: "Vuelos, hoteles, comidas Madrid/Oporto antes del camino" },
  { key: "viaticos-durante",  label: "6. Viáticos durante",   shortLabel: "Durante",     description: "Almuerzos y gastos personales del equipo" },
  { key: "viaticos-post",     label: "7. Viáticos después",   shortLabel: "Post",        description: "Tren, hoteles, comidas Madrid/Oporto al regreso" },
  { key: "por-peregrino",     label: "8. Por peregrino",      shortLabel: "Por peregrino", description: "Mochilas, materiales, vino, credenciales, seguro" },
];

export const DAY_KIND_LABELS: Record<string, string> = {
  pre_camino: "Pre-camino",
  llegada: "Llegada",
  camino: "Camino",
  descanso: "Descanso",
  excursion: "Excursión",
  salida: "Salida",
  post_camino: "Post-camino",
};
