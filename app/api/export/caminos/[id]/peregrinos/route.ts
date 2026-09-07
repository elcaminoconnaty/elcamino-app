import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { appendSheet, xlsxResponse, fileSlug } from "@/lib/export";

export const dynamic = "force-dynamic";

/** Días que le quedan al pasaporte contra la fecha de regreso del camino. */
function vigencia(expiry: string | null, endDate: string | null) {
  if (!expiry) return "";
  if (!endDate) return "";
  const dias = Math.round((new Date(expiry).getTime() - new Date(endDate).getTime()) / 86_400_000);
  if (dias < 0) return "VENCIDO antes del regreso";
  if (dias < 180) return `Vence ${dias} días después del regreso`;
  return "";
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: departure }, { data: registrations }] = await Promise.all([
    supabase.from("departures").select("id, name, start_date, end_date").eq("id", params.id).maybeSingle(),
    supabase
      .from("registrations")
      .select("status, notes, pilgrims!inner(*)")
      .eq("departure_id", params.id)
      .neq("status", "cancelado"),
  ]);

  if (!departure) return NextResponse.json({ error: "Camino no encontrado" }, { status: 404 });
  const d = departure as any;

  const rows = (registrations ?? [])
    .map((r: any) => ({ ...r, p: r.pilgrims }))
    .filter((r: any) => r.p && !r.p.deleted_at)
    .sort((a: any, b: any) => a.p.full_name.localeCompare(b.p.full_name, "es"))
    .map((r: any) => {
      const p = r.p;
      return {
        "Nombre completo": p.full_name ?? "",
        "Teléfono": p.phone ?? "",
        "Correo": p.email ?? "",
        "Contacto de emergencia": p.emergency_contact_name ?? "",
        "Teléfono de emergencia": p.emergency_contact_phone ?? "",
        "N° pasaporte": p.passport_number ?? "",
        "Emisión pasaporte": p.passport_issue_date ?? "",
        "Expiración pasaporte": p.passport_expiry_date ?? "",
        "Alerta pasaporte": vigencia(p.passport_expiry_date, d.end_date),
        "Nacionalidad": p.nationality ?? "",
        "Sexo": p.sex ?? "",
        "Fecha de nacimiento": p.birth_date ?? "",
        "Documento local": p.document_id ?? "",
        "Tipo de documento": p.document_kind ?? "",
        "País": p.country ?? "",
        "Dirección": p.address ?? "",
        "Notas dietarias": p.dietary_notes ?? "",
        "Equipo": p.is_team ? "Sí" : "",
        "Estado inscripción": r.status ?? "",
        "Notas": p.notes ?? "",
      };
    });

  // Lo que falta por completar, que es lo que se persigue antes de viajar.
  const faltantes = rows
    .map((r) => {
      const huecos = [
        !r["Teléfono"] && "teléfono",
        !r["Correo"] && "correo",
        !r["Contacto de emergencia"] && "contacto de emergencia",
        !r["Teléfono de emergencia"] && "teléfono de emergencia",
        !r["N° pasaporte"] && "n° de pasaporte",
        !r["Expiración pasaporte"] && "expiración del pasaporte",
        !r["Fecha de nacimiento"] && "fecha de nacimiento",
      ].filter(Boolean) as string[];
      return { nombre: r["Nombre completo"], huecos, alerta: r["Alerta pasaporte"] };
    })
    .filter((x) => x.huecos.length > 0 || x.alerta)
    .map((x) => ({
      "Peregrino": x.nombre,
      "Datos que faltan": x.huecos.join(", "),
      "Alerta pasaporte": x.alerta,
    }));

  const wb = XLSX.utils.book_new();
  appendSheet(wb, "Peregrinos", rows, "Este camino no tiene peregrinos inscritos.");
  appendSheet(wb, "Datos por completar", faltantes, "No falta ningún dato. 🎉");

  const filename = `peregrinos-${fileSlug(d.name)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return xlsxResponse(wb, filename);
}
