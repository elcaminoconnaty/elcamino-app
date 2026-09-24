/**
 * El enlace personal del formulario de registro, de punta a punta, y las descargas del equipo.
 *
 *   npx tsx --tsconfig scripts/tsconfig.acciones.json scripts/probar-registro-personal.ts [carpeta]
 *
 * OJO: corre contra la base de PRODUCCIÓN. Crea un peregrino de prueba inscrito en Abril 2027
 * con su enlace personal, abre el enlace, lo busca por nombre en el enlace del grupo (si el
 * camino tiene uno), manda el formulario, arma la carta, la ficha y el Excel, y borra todo lo
 * que creó. Si se le pasa una carpeta, deja ahí la carta, la ficha y el Excel para mirarlos.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverEnlace, buscarPorNombre, enviarFormulario, fichaPorToken } from "@/lib/registro/por-token";
import { armarCarta } from "@/lib/bienvenida/datos";
import { armarDocumentoDeViaje } from "@/lib/travel-doc/datos";
import { CartaBienvenidaPDF } from "@/components/pdf/carta-bienvenida";
import { registroDelCamino, registroDeInscripcion } from "@/lib/registro/datos-equipo";
import { construirExcelRegistro } from "@/lib/registro/excel";
import { FichaRegistroPDF } from "@/components/pdf/ficha-registro";

const DEP = "39fc6fa6-c5c3-4525-b2b8-5bbf261d07e9"; // Camino Francés — Abril 2027
const carpeta = process.argv[2] ?? null;
let fallos = 0;
const check = (ok: boolean, m: string) => { console.log(`${ok ? "  ✓" : "  ✗"} ${m}`); if (!ok) fallos++; };

(async () => {
  const db = createAdminClient();
  const token = crypto.randomBytes(32).toString("hex");
  const { data: p, error: e1 } = await db
    .from("pilgrims")
    .insert({ full_name: "Zuleika Prueba Registroborrar", nickname: "Zule", sex: "F", email: "prueba@example.com", phone: "+57 300 000 0000", notes: "PRUEBA AUTOMÁTICA — borrar" })
    .select("id")
    .single();
  if (e1) throw e1;
  const { data: reg, error: e2 } = await db
    .from("registrations")
    .insert({ pilgrim_id: p.id, departure_id: DEP, total_eur: 0, status: "pre_inscrito", form_token: token, notes: "PRUEBA AUTOMÁTICA — borrar" })
    .select("id")
    .single();
  if (e2) { await db.from("pilgrims").delete().eq("id", p.id); throw e2; }

  const datosBase = {
    full_name: "Zuleika Prueba Registroborrar", email: "prueba@example.com", phone: "+57 300 000 0000",
    birth_date: "1990-05-10", passport_number: "ax 123-456", passport_expiry_date: "2027-08-01",
    nickname: "Zule", address: "Calle 1 # 2-3, Medellín, Colombia", instagram: "@zule",
    emergency_contact_name: "Mamá Prueba", emergency_contact_relation: "Mamá", emergency_contact_phone: "+57 311 111 1111",
    shirt_size: "M", sandal_size: 44, dietary_notes: "Sin gluten",
  };
  try {
    console.log("Enlace personal");
    const enlace = await resolverEnlace(token);
    check(enlace?.tipo === "personal", "el token personal abre el formulario de esa persona");
    if (enlace?.tipo === "personal") {
      check(enlace.ficha.saludo === "Zule", `saluda por el apodo (${enlace.ficha.saludo})`);
      check(enlace.ficha.sexo === "F", "sabe que es peregrina (Bienvenida)");
      check(enlace.ficha.regreso === "2027-04-30", `mide la vigencia contra el regreso (${enlace.ficha.regreso})`);
      check(enlace.ficha.prellenado?.phone === "+57 300 000 0000", "llega con sus propios datos");
      check(!!enlace.ficha.cartaUrl?.includes(token), "trae el enlace a su carta");
    }
    check((await resolverEnlace("f".repeat(64))) === null, "un token inventado no abre nada");
    check((await fichaPorToken(token, crypto.randomUUID())) === null, "con el token personal no se puede pedir otra inscripción");

    // Si el camino no tiene enlace de grupo, se le pone uno temporal y se le quita al final.
    const { data: dep0 } = await db.from("departures").select("registration_token").eq("id", DEP).single();
    const tokenTemporal = dep0?.registration_token ? null : crypto.randomBytes(32).toString("hex");
    if (tokenTemporal) await db.from("departures").update({ registration_token: tokenTemporal }).eq("id", DEP);
    const dep = { registration_token: dep0?.registration_token ?? tokenTemporal };
    try {
      console.log("Enlace del grupo");
      const g = await resolverEnlace(dep.registration_token!);
      check(g?.tipo === "grupo", "el token del camino abre el buscador, no una lista");
      const r0 = await buscarPorNombre(dep.registration_token!, "Zuleika Registroborrar");
      check(!r0.ok && r0.motivo === "personal", "quien ya tiene enlace personal no puede entrar por el del grupo");
      const bloqueada = await fichaPorToken(dep.registration_token!, reg.id);
      check(!!bloqueada?.bloqueado, "y si fuerza la URL, la página le dice que use su enlace");
      const intento = await enviarFormulario(dep.registration_token!, reg.id, datosBase);
      check(!intento.ok, "por el grupo no se le pueden pisar los datos");
      // Sin enlace personal todavía: el del grupo sí la deja entrar.
      await db.from("registrations").update({ form_token: null }).eq("id", reg.id);
      const r1 = await buscarPorNombre(dep.registration_token!, "zuleika registroborrar");
      check(r1.ok && r1.registrationId === reg.id, "nombre + apellido (sin tildes ni mayúsculas) encuentra a la persona");
      const r1b = await buscarPorNombre(dep.registration_token!, "Zuleika Andrea Prueba Registroborrar Gómez");
      check(r1b.ok, "también si escribe el nombre más largo que como está guardado");
      const r2 = await buscarPorNombre(dep.registration_token!, "zuleika");
      check(!r2.ok && r2.motivo === "corto", "solo el nombre no alcanza");
      const r3 = await buscarPorNombre(dep.registration_token!, "Nadie Inventado");
      check(!r3.ok && r3.motivo === "ninguno", "un nombre que no está no entra");
      const f2 = await fichaPorToken(dep.registration_token!, reg.id);
      check(!!f2 && f2.prellenado === null && f2.email === null && !f2.tienePasaporte, "por el enlace del grupo no se ve nada de la persona (ni el correo)");
    } finally {
      await db.from("registrations").update({ form_token: token }).eq("id", reg.id);
      if (tokenTemporal) await db.from("departures").update({ registration_token: null }).eq("id", DEP);
    }

    console.log("Enviar el formulario");
    const datos = datosBase;
    const malo = await enviarFormulario(token, reg.id, { ...datos, sandal_size: 99 });
    check(!malo.ok, "rechaza una talla que no existe");
    check(!(await enviarFormulario(token, reg.id, { ...datos, birth_date: "1990-02-31" })).ok, "rechaza una fecha imposible (31 de febrero)");
    const ok = await enviarFormulario(token, reg.id, datos);
    check(ok.ok, "guarda el formulario");
    const { data: guardado } = await db.from("pilgrims").select("passport_number, shirt_size, sandal_size, instagram, emergency_contact_relation").eq("id", p.id).single();
    check(guardado?.passport_number === "AX123456", `el número queda limpio en la tarjeta (${guardado?.passport_number})`);
    check(guardado?.instagram === "zule" && guardado?.shirt_size === "M" && guardado?.sandal_size === 44, "tallas (hasta la 45) e Instagram en la tarjeta");
    await db.from("pilgrims").update({ passport_ocr: { passport_number: "AX123465", confidence: "high" } }).eq("id", p.id);

    console.log("Descargas del equipo");
    const ficha = await registroDeInscripcion(reg.id, db);
    const av = ficha?.fila.avisos.map((a) => a.texto).join(" | ") ?? "";
    check(av.includes("AX123465"), "avisa que el número escrito no coincide con el leído");
    check(av.includes("6 meses"), "avisa que el pasaporte no tiene 6 meses de vigencia");
    const carta = await armarCarta(DEP, { registrationId: reg.id, publico: true });
    check(carta.destinatario?.bienvenida === "Bienvenida, Zule", `carta con su nombre (${carta.destinatario?.bienvenida})`);
    check(carta.encuentro?.fecha === "2027-04-23" && carta.cierre?.fecha === "2027-04-30", "fechas de la carta de abril (23 → 30)");
    const viaje = await armarDocumentoDeViaje(DEP, { publico: true });
    const encuentroViaje = viaje.diasCompletos.find((x) => x.rotulo === "Encuentro")?.fecha;
    check(encuentroViaje === carta.encuentro?.fecha, `la carta y el documento de viaje dan el mismo día de encuentro (${encuentroViaje})`);
    const pdfCarta = await renderToBuffer(CartaBienvenidaPDF({ carta }) as any);
    check(pdfCarta.length > 100_000, `la carta se genera (${Math.round(pdfCarta.length / 1024)} KB)`);
    const pdfFicha = await renderToBuffer(FichaRegistroPDF({ camino: ficha!.camino, fila: ficha!.fila, foto: { src: null, nota: "Sin pasaporte (prueba)." } }) as any);
    check(pdfFicha.length > 10_000, "la ficha se genera");
    const todo = await registroDelCamino(DEP, db);
    const xlsx = await construirExcelRegistro(todo!);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx as any);
    check(wb.worksheets.map((w) => w.name).join(",") === "Registro,Tallas,Alimentación,Por revisar", "el Excel trae sus cuatro pestañas");
    let enExcel = false;
    wb.getWorksheet("Registro")!.eachRow((row) => { if (String(row.getCell(1).value).includes("Registroborrar")) enExcel = true; });
    check(enExcel, "la peregrina de prueba aparece en el Excel");
    if (carpeta) {
      fs.writeFileSync(path.join(carpeta, "carta-prueba.pdf"), pdfCarta);
      fs.writeFileSync(path.join(carpeta, "ficha-prueba.pdf"), pdfFicha);
      fs.writeFileSync(path.join(carpeta, "registro-prueba.xlsx"), xlsx);
    }
  } finally {
    await db.from("registrations").delete().eq("id", reg.id);
    await db.from("pilgrims").delete().eq("id", p.id);
    const { count } = await db.from("pilgrims").select("id", { count: "exact", head: true }).eq("id", p.id);
    console.log(count === 0 ? "\nLimpio: se borró el peregrino de prueba." : "\n¡OJO! Quedó el peregrino de prueba.");
  }
  console.log(fallos ? `\n${fallos} fallos` : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
