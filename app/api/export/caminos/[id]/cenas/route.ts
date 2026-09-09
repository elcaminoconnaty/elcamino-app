import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { appendSheet, appendAoaSheet, xlsxResponse, fileSlug, sheetName } from "@/lib/export";
import { COURSE_LABELS, type CourseKind } from "@/lib/data/menus";

export const dynamic = "force-dynamic";

type Row = any;

function courseLabel(r: Row) {
  return r.course_label && r.course_label !== r.course ? r.course_label : (COURSE_LABELS[r.course as CourseKind] ?? r.course);
}

/** Etiqueta corta de una cena, para encabezar columnas de la matriz. */
function dinnerLabel(d: Row) {
  const fecha = d.check_in ? String(d.check_in).slice(5) : "";
  return [d.day_number != null ? `D${d.day_number}` : null, fecha, d.provider_name].filter(Boolean).join(" · ");
}

type Cena = {
  reservation_id: string;
  info: Row;
  /** Secciones en orden, con su rótulo. */
  courses: { id: string; label: string; required: boolean }[];
  /** filas de v_menu_choices agrupadas por peregrino */
  porPeregrino: Map<string, Row[]>;
  noCenan: string[];
};

/**
 * La hoja que se le manda al restaurante: sus datos, la lista nominal con lo que eligió
 * cada uno, quiénes no cenan, el conteo por plato y las notas de alimentación.
 */
function restaurantSheet(cenas: Cena[], caminoNombre: string): (string | number)[][] {
  const r0 = cenas[0].info;
  const aoa: (string | number)[][] = [];
  aoa.push([r0.provider_name ?? ""]);
  const ubicacion = [r0.provider_address, r0.location ?? r0.provider_city].filter(Boolean).join(" · ");
  if (ubicacion) aoa.push([ubicacion]);
  const contacto = [r0.provider_phone, r0.provider_email].filter(Boolean).join(" · ");
  if (contacto) aoa.push([contacto]);
  aoa.push([caminoNombre]);

  for (const cena of cenas) {
    const d = cena.info;
    const personas = cena.porPeregrino.size;
    const cenan = personas - cena.noCenan.length;
    const eligieron = Array.from(cena.porPeregrino.entries()).filter(
      ([id, filas]) => !cena.noCenan.includes(id) && filas.filter((f) => f.required).every((f) => f.option_id)
    ).length;
    aoa.push([]);
    aoa.push([`Cena del ${d.check_in ?? "?"}${d.day_number != null ? ` (día ${d.day_number})` : ""}${d.confirmation_ref ? ` · Reserva: ${d.confirmation_ref}` : ""}`]);
    aoa.push([`${personas} personas · ${cenan} cenan · ${eligieron} eligieron · ${Math.max(cenan - eligieron, 0)} pendiente${cenan - eligieron === 1 ? "" : "s"}`]);
    aoa.push([]);

    if (cena.courses.length === 0) {
      aoa.push(["⚠ Este restaurante todavía no tiene menú cargado; no hay elecciones que mandar."]);
      continue;
    }

    aoa.push(["Peregrino", ...cena.courses.map((c) => c.label), "Alimentación", "Notas"]);
    const nombres = Array.from(cena.porPeregrino.entries())
      .filter(([id]) => !cena.noCenan.includes(id))
      .map(([id, filas]) => [id, filas[0].pilgrim_name as string, filas] as const)
      .sort((a, b) => a[1].localeCompare(b[1], "es"));
    for (const [, nombre, filas] of nombres) {
      const porCurso = new Map(filas.map((f) => [f.course_id, f]));
      const fila: (string | number)[] = [nombre];
      for (const c of cena.courses) {
        const f = porCurso.get(c.id);
        fila.push(f?.option_name ?? (c.required ? "— sin elegir —" : ""));
      }
      fila.push(filas[0].dietary_notes ?? "", Array.from(new Set(filas.map((f) => f.choice_notes).filter(Boolean))).join("; "));
      aoa.push(fila);
    }

    if (cena.noCenan.length > 0) {
      const nombresNo = cena.noCenan.map((id) => cena.porPeregrino.get(id)?.[0]?.pilgrim_name ?? "").filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
      aoa.push([]);
      aoa.push(["No cenan", nombresNo.join(", ")]);
    }

    // Resumen por plato: lo que el restaurante realmente necesita para la cocina.
    const conteo = new Map<string, { seccion: string; plato: string; n: number }>();
    for (const [id, filas] of Array.from(cena.porPeregrino.entries())) {
      if (cena.noCenan.includes(id)) continue;
      for (const f of filas) {
        if (!f.option_id) continue;
        const k = `${f.course_id}:${f.option_id}`;
        const prev = conteo.get(k) ?? { seccion: courseLabel(f), plato: f.option_name, n: 0 };
        prev.n++;
        conteo.set(k, prev);
      }
    }
    if (conteo.size > 0) {
      aoa.push([]);
      aoa.push(["Resumen por plato"]);
      aoa.push(["Sección", "Plato", "Cantidad"]);
      const orden = new Map(cena.courses.map((c, i) => [c.label, i]));
      for (const x of Array.from(conteo.values()).sort((a, b) => (orden.get(a.seccion) ?? 99) - (orden.get(b.seccion) ?? 99) || b.n - a.n)) {
        aoa.push([x.seccion, x.plato, x.n]);
      }
    }

    const dietas = Array.from(cena.porPeregrino.entries())
      .filter(([id, filas]) => !cena.noCenan.includes(id) && filas[0].dietary_notes)
      .map(([, filas]) => [filas[0].pilgrim_name, filas[0].dietary_notes] as [string, string])
      .sort((a, b) => a[0].localeCompare(b[0], "es"));
    if (dietas.length > 0) {
      aoa.push([]);
      aoa.push(["Alimentación"]);
      for (const d of dietas) aoa.push(d);
    }
  }
  return aoa;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const restauranteFiltro = new URL(req.url).searchParams.get("restaurante");

  const [{ data: departure }, { data: choices }, { data: cenasTodas }] = await Promise.all([
    supabase.from("departures").select("id, name").eq("id", params.id).maybeSingle(),
    supabase.from("v_menu_choices").select("*").eq("departure_id", params.id),
    // Las cenas sin menú no aparecen en v_menu_choices; se piden aparte para que no
    // desaparezcan del Resumen.
    supabase.from("v_dinner_reservations").select("*").eq("departure_id", params.id),
  ]);
  if (!departure) return NextResponse.json({ error: "Camino no encontrado" }, { status: 404 });
  const caminoNombre = (departure as any).name as string;

  const reservaIds = (cenasTodas ?? []).map((c: any) => c.reservation_id);
  const { data: optOuts } = reservaIds.length
    ? await supabase.from("reservation_opt_outs").select("reservation_id, pilgrim_id, pilgrims(full_name)").in("reservation_id", reservaIds).eq("kind", "cena")
    : { data: [] as any[] };
  const noCenanPor = new Map<string, { id: string; nombre: string }[]>();
  for (const o of (optOuts ?? []) as any[]) {
    noCenanPor.set(o.reservation_id, [...(noCenanPor.get(o.reservation_id) ?? []), { id: o.pilgrim_id, nombre: o.pilgrims?.full_name ?? "" }]);
  }

  // Armar cada cena a partir de las filas peregrino × sección
  let infos = ((cenasTodas ?? []) as Row[]).sort(
    (a, b) => String(a.check_in ?? "9999").localeCompare(String(b.check_in ?? "9999")) || (a.provider_name ?? "").localeCompare(b.provider_name ?? "", "es")
  );
  if (restauranteFiltro) infos = infos.filter((i) => i.provider_id === restauranteFiltro);
  const filasPor = new Map<string, Row[]>();
  for (const r of (choices ?? []) as Row[]) filasPor.set(r.reservation_id, [...(filasPor.get(r.reservation_id) ?? []), r]);

  const cenas: Cena[] = infos.map((info) => {
    const filas = (filasPor.get(info.reservation_id) ?? []).sort((a, b) => a.course_position - b.course_position);
    const courses = Array.from(new Map(filas.map((f) => [f.course_id, { id: f.course_id, label: courseLabel(f), required: !!f.required }])).values());
    const porPeregrino = new Map<string, Row[]>();
    for (const f of filas) porPeregrino.set(f.pilgrim_id, [...(porPeregrino.get(f.pilgrim_id) ?? []), f]);
    const noCenan = (noCenanPor.get(info.reservation_id) ?? []).map((x) => x.id);
    // Quienes no cenan pero no están en la vista (cena sin menú) igual tienen que contarse.
    for (const x of noCenanPor.get(info.reservation_id) ?? []) {
      if (!porPeregrino.has(x.id)) porPeregrino.set(x.id, [{ pilgrim_id: x.id, pilgrim_name: x.nombre, required: false }]);
    }
    return { reservation_id: info.reservation_id, info, courses, porPeregrino, noCenan };
  });

  const wb = XLSX.utils.book_new();

  // ── Una pestaña por restaurante ───────────────────────────────────────────
  const porRestaurante = new Map<string, Cena[]>();
  for (const c of cenas) {
    const key = c.info.provider_id ?? c.info.provider_name ?? "sin-restaurante";
    porRestaurante.set(key, [...(porRestaurante.get(key) ?? []), c]);
  }

  if (restauranteFiltro) {
    const grupo = Array.from(porRestaurante.values())[0];
    if (!grupo) return NextResponse.json({ error: "Ese restaurante no tiene cenas en este camino" }, { status: 404 });
    appendAoaSheet(wb, sheetName(grupo[0].info.provider_name ?? "Restaurante"), restaurantSheet(grupo, caminoNombre));
    return xlsxResponse(wb, `menu-${fileSlug(grupo[0].info.provider_name ?? "restaurante")}-${fileSlug(caminoNombre)}.xlsx`);
  }

  // ── Hoja 1: resumen por cena ──────────────────────────────────────────────
  const resumen = cenas.map((c) => {
    const personas = c.porPeregrino.size;
    const cenan = personas - c.noCenan.length;
    const eligieron = Array.from(c.porPeregrino.entries()).filter(
      ([id, filas]) => !c.noCenan.includes(id) && c.courses.length > 0 && filas.filter((f) => f.required).every((f) => f.option_id)
    ).length;
    return {
      "Día": c.info.day_number ?? "",
      "Fecha": c.info.check_in ?? "",
      "Restaurante": c.info.provider_name ?? "",
      "Ciudad": c.info.location ?? c.info.provider_city ?? "",
      "Teléfono": c.info.provider_phone ?? "",
      "Email": c.info.provider_email ?? "",
      "Cena del hotel": c.info.via_meal_kind ? "" : c.info.via_rooms ? "Sí" : "",
      "Menú cargado": c.courses.length > 0 ? "Sí" : "No",
      "Secciones": c.courses.map((x) => x.label).join(" · "),
      "Inscritos": personas,
      "No cenan": c.noCenan.length,
      "Eligieron": eligieron,
      "Pendientes": c.courses.length > 0 ? Math.max(cenan - eligieron, 0) : "",
      "Personas reservadas": c.info.meal_persons ?? "",
      "Estado": c.info.reservation_status ?? "",
      "Reserva": c.info.confirmation_ref ?? "",
      "Notas": c.info.reservation_notes ?? "",
    };
  });
  appendSheet(wb, "Resumen", resumen, "Este camino no tiene cenas cargadas.");

  const usadas = new Map<string, number>();
  for (const grupo of Array.from(porRestaurante.values())) {
    let nombre = sheetName(grupo[0].info.provider_name ?? "Restaurante");
    const n = (usadas.get(nombre) ?? 0) + 1;
    usadas.set(nombre, n);
    if (n > 1) nombre = sheetName(`${nombre} ${n}`);
    appendAoaSheet(wb, nombre, restaurantSheet(grupo, caminoNombre));
  }

  // ── Matriz peregrino × cena ───────────────────────────────────────────────
  const usadosLabel = new Map<string, number>();
  const cenasOrdenadas = cenas.map((c) => {
    const base = dinnerLabel(c.info);
    const n = (usadosLabel.get(base) ?? 0) + 1;
    usadosLabel.set(base, n);
    return { cena: c, label: n === 1 ? base : `${base} (${n})` };
  });
  const peregrinos = new Map<string, string>();
  for (const c of cenas) for (const [id, filas] of Array.from(c.porPeregrino.entries())) if (filas[0]?.pilgrim_name) peregrinos.set(id, filas[0].pilgrim_name);
  const matriz = Array.from(peregrinos.entries())
    .sort((a, b) => a[1].localeCompare(b[1], "es"))
    .map(([id, nombre]) => {
      const fila: Record<string, any> = { "Peregrino": nombre };
      for (const { cena, label } of cenasOrdenadas) {
        if (cena.noCenan.includes(id)) {
          fila[label] = "no cena";
          continue;
        }
        const filas = cena.porPeregrino.get(id) ?? [];
        const platos = filas.filter((f) => f.option_id).map((f) => f.option_name);
        fila[label] = cena.courses.length === 0 ? "" : platos.length === 0 ? "pendiente" : platos.join(" / ");
      }
      return fila;
    });
  appendSheet(wb, "Matriz por peregrino", matriz, "Nadie ha elegido menú todavía.");

  return xlsxResponse(wb, `cenas-${fileSlug(caminoNombre)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
