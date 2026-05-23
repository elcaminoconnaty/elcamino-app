import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEUR(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(n));
}

export function formatCOP(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

/**
 * Parsea una fecha. Si viene como 'YYYY-MM-DD' (input type=date), la trata
 * como fecha LOCAL (no UTC) para evitar que se reste un día por zona horaria.
 */
function parseLocalDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day, 12, 0, 0); // mediodía local para evitar DST edge
  }
  return new Date(d);
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(parseLocalDate(d));
}

export function formatDateLong(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parseLocalDate(d));
}

export function daysUntil(date: string | Date) {
  const d = parseLocalDate(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
