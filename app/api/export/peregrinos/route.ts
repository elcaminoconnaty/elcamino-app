import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: pilgrims } = await supabase.from("pilgrims").select("*").is("deleted_at", null).order("full_name");
  const { data: balances } = await supabase.from("v_pilgrim_balance").select("*").neq("status", "cancelado");

  const balancesByPilgrim = new Map<string, any[]>();
  (balances ?? []).forEach((b: any) => {
    const arr = balancesByPilgrim.get(b.pilgrim_id) ?? [];
    arr.push(b);
    balancesByPilgrim.set(b.pilgrim_id, arr);
  });

  const rows = (pilgrims ?? []).map((p: any) => {
    const bals = balancesByPilgrim.get(p.id) ?? [];
    const totalAcordado = bals.reduce((s, b) => s + Number(b.net_total_eur || 0), 0);
    const totalPagado = bals.reduce((s, b) => s + Number(b.paid_eur || 0), 0);
    const totalPendiente = bals.reduce((s, b) => s + Number(b.pending_eur || 0), 0);
    const caminos = bals.map((b) => b.departure_name).join("; ");
    return {
      "Nombre": p.full_name,
      "Email": p.email ?? "",
      "Teléfono": p.phone ?? "",
      "País": p.country ?? "",
      "Documento": p.document_id ?? "",
      "N° Pasaporte": p.passport_number ?? "",
      "Nacionalidad": p.nationality ?? "",
      "Sexo": p.sex ?? "",
      "Nacimiento": p.birth_date ?? "",
      "Emisión pasaporte": p.passport_issue_date ?? "",
      "Expiración pasaporte": p.passport_expiry_date ?? "",
      "Contacto emergencia": p.emergency_contact_name ?? "",
      "Tel. emergencia": p.emergency_contact_phone ?? "",
      "Notas dietarias": p.dietary_notes ?? "",
      "Caminos": caminos,
      "Total acordado EUR": totalAcordado,
      "Pagado EUR": totalPagado,
      "Pendiente EUR": totalPendiente,
      "Notas": p.notes ?? "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0] ?? {}).map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Peregrinos");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `peregrinos-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
