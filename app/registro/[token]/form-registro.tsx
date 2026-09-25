"use client";

import { useMemo, useState, useTransition } from "react";
import { COLOR, ESTADO } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";
import { ACEPTA_PASAPORTE, revisarArchivoDePasaporte } from "@/lib/passport/formatos";
import { normalizarNumero, type Aviso } from "@/lib/passport/verificar";
import { REGISTRO, TALLAS_CAMISETA, TALLAS_SANDALIA, INDICATIVOS, GUIA_SANDALIAS, COMO_MEDIR_PIE } from "@/lib/registro/textos";
import type { FichaParaFormulario } from "@/lib/registro/por-token";
import { accionUrlPasaporte, accionLeerPasaporte, accionEnviarFormulario } from "./actions";

const INPUT: React.CSSProperties = { width: "100%", border: `1px solid ${COLOR.piedra}`, background: "#fff", borderRadius: 4, padding: "10px 12px", fontSize: 16, color: COLOR.atlantico };
const LABEL: React.CSSProperties = { display: "block", fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: COLOR.ocreProfundo, marginBottom: 6 };
const AYUDA: React.CSSProperties = { fontSize: 13, color: COLOR.castano, margin: "6px 0 0", lineHeight: 1.5 };
const MAL: React.CSSProperties = { background: "#F3E3E0", color: ESTADO.error, fontSize: 14, lineHeight: 1.5, borderRadius: 4, padding: "8px 12px" };

function Campo({ label, ayuda, obligatorio = true, children }: { label: string; ayuda?: React.ReactNode; obligatorio?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL}>
        {label}
        {!obligatorio && <span style={{ textTransform: "none", letterSpacing: 0, color: COLOR.castano }}> · opcional</span>}
      </label>
      {children}
      {ayuda && <p style={AYUDA}>{ayuda}</p>}
    </div>
  );
}

function partirTelefono(t: string | null | undefined): { ind: string; num: string } {
  const s = (t ?? "").trim();
  // El más largo primero: "+593" no puede quedar partido como "+5" + "93".
  const hit = [...INDICATIVOS].sort((a, b) => b.code.length - a.code.length).find((i) => s.startsWith(i.code));
  if (hit) return { ind: hit.code, num: s.slice(hit.code.length).trim() };
  return { ind: "+57", num: s.replace(/^\+/, "") };
}

function edadDe(fecha: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  // Por partes y no con new Date("AAAA-MM-DD"), que es medianoche UTC y en Colombia cae el día anterior.
  const [a, m, d] = fecha.split("-").map(Number);
  const hoy = new Date();
  let e = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) e--;
  return e >= 0 && e < 120 ? e : null;
}

/** El vencimiento contra el regreso: la carta dice que hacen falta 6 meses de vigencia. */
function problemaDeVigencia(vence: string, regreso: string | null): string | null {
  if (!regreso || !/^\d{4}-\d{2}-\d{2}$/.test(vence)) return null;
  const minimo = new Date(`${regreso}T12:00:00Z`);
  minimo.setUTCMonth(minimo.getUTCMonth() + 6);
  const min = minimo.toISOString().slice(0, 10);
  if (vence >= min) return null;
  const [a, m, d] = min.split("-");
  return `Tu pasaporte tiene que estar vigente al menos hasta el ${d}/${m}/${a} (6 meses después del regreso). Con esta fecha no podrías viajar: empieza ya la renovación y avísanos.`;
}

function GuiaDeTallas() {
  return (
    <details className="mt-2 rounded" style={{ background: "#fff", border: `1px solid ${COLOR.piedra}` }}>
      <summary style={{ cursor: "pointer", padding: "10px 12px", fontSize: 14, color: COLOR.ocreProfundo, textDecoration: "underline" }}>Ver la guía de tallas</summary>
      <div className="px-3 pb-3">
        {REGISTRO.guiaSandaliasImagen ? (
          <>
            {/* La guía de la marca ya trae cómo medir el pie; acá solo va el consejo que le falta. */}
            <a href={REGISTRO.guiaSandaliasImagen} target="_blank" rel="noreferrer" title="Ábrela en grande">
              <img src={REGISTRO.guiaSandaliasImagen} alt="Guía de tallas de calzado Evacol: largo del pie en centímetros y talla equivalente" style={{ width: "100%", borderRadius: 4 }} />
            </a>
            <p style={{ ...AYUDA, marginTop: 8 }}>Tócala para verla en grande. {COMO_MEDIR_PIE[COMO_MEDIR_PIE.length - 1]}</p>
          </>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: COLOR.atlantico }}>
              <thead>
                <tr style={{ background: COLOR.atlantico, color: COLOR.alba }}>
                  {["Talla", "Largo de tu pie (cm)"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 500, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GUIA_SANDALIAS.map((g, i) => (
                  <tr key={g.eu} style={{ background: i % 2 ? COLOR.alba : "#fff" }}>
                    <td style={{ padding: "5px 8px", fontWeight: 700 }}>{g.eu}</td>
                    <td style={{ padding: "5px 8px" }}>{g.cm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...LABEL, marginTop: 12 }}>Cómo medir tu pie</p>
            <ol style={{ margin: 0, paddingLeft: 18, color: COLOR.castano, fontSize: 13, lineHeight: 1.6 }}>
              {COMO_MEDIR_PIE.map((t) => <li key={t}>{t}</li>)}
            </ol>
          </>
        )}
      </div>
    </details>
  );
}

/**
 * El formulario. Con el enlace personal llega con sus datos (corrige en vez de reescribir);
 * con el enlace del camino llega vacío, porque cualquiera del grupo podría abrirlo.
 */
export function FormularioRegistro({ token, registrationId, ficha }: { token: string; registrationId: string; ficha: FichaParaFormulario }) {
  const pre = ficha.prellenado ?? {};
  const tel = partirTelefono(pre.phone);
  const em = partirTelefono(pre.emergency_contact_phone);
  const [f, setF] = useState({
    full_name: pre.full_name || ficha.nombre,
    email: pre.email || ficha.email || "",
    telInd: tel.ind,
    telNum: tel.num,
    birth_date: pre.birth_date ?? "",
    passport_number: pre.passport_number ?? "",
    passport_expiry_date: pre.passport_expiry_date ?? "",
    nickname: pre.nickname ?? "",
    address: pre.address ?? "",
    instagram: pre.instagram ?? "",
    emergency_contact_name: pre.emergency_contact_name ?? "",
    emergency_contact_relation: pre.emergency_contact_relation ?? "",
    emInd: em.ind,
    emNum: em.num,
    shirt_size: pre.shirt_size ?? "",
    sandal_size: pre.sandal_size ? String(pre.sandal_size) : "",
    dietary_notes: pre.dietary_notes ?? "",
  });
  const [foto, setFoto] = useState<{ estado: "nada" | "subiendo" | "leyendo" | "lista" | "error"; mensaje?: string }>({ estado: ficha.tienePasaporte ? "lista" : "nada" });
  // El número que leímos del pasaporte: contra esto se compara lo que escriba.
  const [leido, setLeido] = useState<string | null>(ficha.lecturaPasaporte);
  const [avisosFoto, setAvisosFoto] = useState<Aviso[]>([]);
  // Si el número no coincide con el leído, el primer toque avisa y el segundo envía.
  const [confirmarNumero, setConfirmarNumero] = useState(false);
  const [estado, setEstado] = useState<"idle" | "enviando" | "listo" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, empezar] = useTransition();
  const edad = useMemo(() => edadDe(f.birth_date), [f.birth_date]);
  const vigencia = useMemo(() => problemaDeVigencia(f.passport_expiry_date, ficha.regreso), [f.passport_expiry_date, ficha.regreso]);
  const numeroDistinto = !!leido && !!f.passport_number && normalizarNumero(leido) !== normalizarNumero(f.passport_number);
  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (k === "passport_number") setConfirmarNumero(false);
  };
  const bienvenida = ficha.sexo === "M" ? "Bienvenido" : ficha.sexo === "F" ? "Bienvenida" : "Te damos la bienvenida";

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Las mismas reglas que usa el equipo desde la plataforma: si el archivo no se va a
    // poder leer, se avisa acá y no después de gastarle los datos del celular.
    const problema = revisarArchivoDePasaporte(file);
    if (problema) {
      setFoto({ estado: "error", mensaje: problema });
      return;
    }
    setFoto({ estado: "subiendo" });
    setAvisosFoto([]);
    try {
      const u = await accionUrlPasaporte({ token, registrationId, filename: file.name });
      if (!u.ok) throw new Error(u.error);
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from("passports").uploadToSignedUrl(u.path, u.uploadToken, file, { contentType: file.type });
      if (upErr) throw new Error("No se pudo subir el archivo. Revisa tu conexión.");
      setFoto({ estado: "leyendo" });
      const r = await accionLeerPasaporte({ token, registrationId, path: u.path });
      if (!r.ok) throw new Error(r.error);
      // Lo leído manda sobre lo que hubiera: es un pasaporte nuevo.
      setF((p) => ({
        ...p,
        passport_number: r.passport_number ?? p.passport_number,
        birth_date: r.birth_date ?? p.birth_date,
        passport_expiry_date: r.passport_expiry_date ?? p.passport_expiry_date,
      }));
      setLeido(r.passport_number ?? null);
      setAvisosFoto(r.avisos);
      setConfirmarNumero(false);
      setFoto({ estado: "lista", mensaje: r.passport_number ? "Leímos tu pasaporte. Revisa que el número y las fechas estén bien." : "Archivo guardado. Escribe abajo el número y las fechas." });
    } catch (err: any) {
      setFoto({ estado: "error", mensaje: err?.message ?? "No se pudo subir el archivo." });
    }
  }

  function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const falta = foto.estado !== "lista" ? "Falta subir tu pasaporte." : !f.shirt_size ? "Elige tu talla de camiseta." : !f.sandal_size ? "Elige tu talla de sandalias." : null;
    if (falta) {
      setError(falta);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (numeroDistinto && !confirmarNumero) {
      setConfirmarNumero(true);
      return;
    }
    setEstado("enviando");
    setError(null);
    empezar(async () => {
      const r = await accionEnviarFormulario({
        token,
        registrationId,
        datos: {
          full_name: f.full_name,
          email: f.email,
          phone: `${f.telInd} ${f.telNum.trim()}`,
          birth_date: f.birth_date,
          passport_number: f.passport_number,
          passport_expiry_date: f.passport_expiry_date,
          nickname: f.nickname,
          address: f.address,
          instagram: f.instagram,
          emergency_contact_name: f.emergency_contact_name,
          emergency_contact_relation: f.emergency_contact_relation,
          emergency_contact_phone: `${f.emInd} ${f.emNum.trim()}`,
          shirt_size: f.shirt_size,
          sandal_size: Number(f.sandal_size),
          dietary_notes: f.dietary_notes,
        },
      });
      if (r.ok) {
        setEstado("listo");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setEstado("error");
        setError(r.error);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  if (estado === "listo") {
    return (
      <section className="rounded p-6" style={{ background: "#E2E8E1", borderLeft: `3px solid ${COLOR.musgo}` }}>
        <h1 className="font-display" style={{ fontSize: 32, color: COLOR.atlantico, margin: 0 }}>¡Gracias, {f.nickname || f.full_name.split(" ")[0]}!</h1>
        <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>{REGISTRO.gracias}</p>
        {vigencia && <p style={{ ...MAL, marginTop: 12 }}>{vigencia}</p>}
        {ficha.cartaUrl && (
          <a href={ficha.cartaUrl} target="_blank" rel="noreferrer" className="inline-block mt-4 rounded px-4 py-2" style={{ background: COLOR.atlantico, color: COLOR.alba, fontSize: 14 }}>
            Descargar mi carta de bienvenida
          </a>
        )}
      </section>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-6">
      <section>
        <h1 className="font-display" style={{ fontSize: 34, color: COLOR.atlantico, margin: 0, lineHeight: 1.1 }}>
          {bienvenida}{ficha.saludo ? `, ${ficha.saludo}` : ""}
        </h1>
        <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6, fontSize: 16 }}>{REGISTRO.bienvenida[0]}</p>
        <p style={{ color: COLOR.castano, marginTop: 8, lineHeight: 1.6 }}>
          Estos son los datos que necesitamos para <strong style={{ color: COLOR.atlantico }}>{ficha.camino}</strong>: reservas, seguro y kit de peregrino.
          {ficha.enviadoEl && " Ya nos los habías enviado; si algo cambió, corrígelo y vuelve a enviar."}
        </p>
        {ficha.cartaUrl && (
          <a href={ficha.cartaUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 14, color: COLOR.ocreProfundo, textDecoration: "underline" }}>
            Lee tu carta de bienvenida
          </a>
        )}
        {error && <p className="mt-3" style={MAL}>{error}</p>}
      </section>

      <Campo label="Nombre completo y apellidos" ayuda="Tal como aparece en tu pasaporte.">
        <input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} style={INPUT} autoComplete="name" required />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Correo">
          <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} style={INPUT} autoComplete="email" required />
        </Campo>
        <Campo label="Celular (WhatsApp)">
          <div className="flex gap-2">
            <select value={f.telInd} onChange={(e) => set("telInd", e.target.value)} style={{ ...INPUT, width: 150 }}>
              {INDICATIVOS.map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}
            </select>
            <input type="tel" value={f.telNum} onChange={(e) => set("telNum", e.target.value)} style={INPUT} autoComplete="tel-national" placeholder="300 123 4567" required />
          </div>
        </Campo>
      </div>

      <fieldset style={{ border: `1px solid ${COLOR.piedra}`, borderRadius: 4, padding: 16, margin: 0, background: "#fff" }}>
        <legend style={{ ...LABEL, marginBottom: 0, padding: "0 6px" }}>Tu pasaporte</legend>
        <p style={{ ...AYUDA, margin: "4px 0 12px" }}>{REGISTRO.pasaporte}</p>
        <div className="rounded p-4" style={{ background: COLOR.alba, border: `1px dashed ${COLOR.ocre}` }}>
          {foto.estado === "lista" && <p style={{ color: COLOR.musgo, fontSize: 14, margin: "0 0 8px" }}>✓ {foto.mensaje ?? "Ya tenemos tu pasaporte. Súbelo de nuevo solo si cambió."}</p>}
          {foto.estado === "error" && <p style={{ color: ESTADO.error, fontSize: 14, margin: "0 0 8px" }}>{foto.mensaje}</p>}
          {(foto.estado === "subiendo" || foto.estado === "leyendo") && (
            <p style={{ color: COLOR.castano, fontSize: 14, margin: "0 0 8px" }}>{foto.estado === "subiendo" ? "Subiendo el archivo…" : "Leyendo tu pasaporte… (unos segundos)"}</p>
          )}
          <input type="file" accept={ACEPTA_PASAPORTE} onChange={subirFoto} disabled={foto.estado === "subiendo" || foto.estado === "leyendo"} style={{ fontSize: 14, color: COLOR.atlantico }} />
          <p style={{ color: COLOR.castano, fontSize: 13, margin: "8px 0 0" }}>Una foto nítida de la página de la foto y los datos (con las dos líneas de abajo), o el PDF del escaneo.</p>
        </div>
        {avisosFoto.map((a) => <p key={a.texto} className="mt-3" style={MAL}>{a.texto}</p>)}

        <div className="grid gap-4 sm:grid-cols-3 mt-4">
          <Campo label="Número">
            <input value={f.passport_number} onChange={(e) => set("passport_number", e.target.value.toUpperCase())} style={INPUT} required />
          </Campo>
          <Campo label="Fecha de nacimiento" ayuda={edad != null ? `${edad} años` : undefined}>
            <input type="date" value={f.birth_date} onChange={(e) => set("birth_date", e.target.value)} style={INPUT} required />
          </Campo>
          <Campo label="Vence el">
            <input type="date" value={f.passport_expiry_date} onChange={(e) => set("passport_expiry_date", e.target.value)} style={INPUT} required />
          </Campo>
        </div>
        {numeroDistinto && (
          <p className="mt-3" style={{ ...MAL, background: COLOR.piedra, color: COLOR.atlantico }}>
            En la foto leímos <strong>{leido}</strong> y escribiste <strong>{normalizarNumero(f.passport_number)}</strong>. Revísalo letra por letra: con ese número hacemos las reservas.
          </p>
        )}
        {vigencia && <p className="mt-3" style={MAL}>{vigencia}</p>}
      </fieldset>

      <Campo label="Sobrenombre o apodo" ayuda={REGISTRO.apodo} obligatorio={false}>
        <input value={f.nickname} onChange={(e) => set("nickname", e.target.value)} style={INPUT} />
      </Campo>

      <Campo label="Dirección de tu lugar de residencia">
        <input value={f.address} onChange={(e) => set("address", e.target.value)} style={INPUT} autoComplete="street-address" placeholder="Calle, número, ciudad y país" required />
      </Campo>

      <Campo label="Tu usuario de Instagram" obligatorio={false}>
        <input value={f.instagram} onChange={(e) => set("instagram", e.target.value)} style={INPUT} placeholder="@" />
      </Campo>

      <fieldset style={{ border: `1px solid ${COLOR.piedra}`, borderRadius: 4, padding: 16, margin: 0 }}>
        <legend style={{ ...LABEL, marginBottom: 0, padding: "0 6px" }}>Contacto de un familiar cercano</legend>
        <p style={{ ...AYUDA, margin: "8px 0 12px" }}>{REGISTRO.contacto}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre">
            <input value={f.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} style={INPUT} required />
          </Campo>
          <Campo label="Parentesco">
            <input value={f.emergency_contact_relation} onChange={(e) => set("emergency_contact_relation", e.target.value)} style={INPUT} placeholder="Mamá, esposo, hermana…" required />
          </Campo>
        </div>
        <div className="mt-4">
          <Campo label="Celular (WhatsApp), con indicativo">
            <div className="flex gap-2">
              <select value={f.emInd} onChange={(e) => set("emInd", e.target.value)} style={{ ...INPUT, width: 150 }}>
                {INDICATIVOS.map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}
              </select>
              <input type="tel" value={f.emNum} onChange={(e) => set("emNum", e.target.value)} style={INPUT} placeholder="300 123 4567" required />
            </div>
          </Campo>
        </div>
      </fieldset>

      <Campo label="Talla de camiseta">
        <div className="flex flex-wrap gap-2">
          {TALLAS_CAMISETA.map((t) => (
            <label key={t} className="cursor-pointer rounded px-4 py-2" style={{ position: "relative", background: f.shirt_size === t ? COLOR.atlantico : "#fff", color: f.shirt_size === t ? COLOR.alba : COLOR.atlantico, border: `1px solid ${f.shirt_size === t ? COLOR.atlantico : COLOR.piedra}`, fontSize: 15 }}>
              <input type="radio" name="shirt" value={t} checked={f.shirt_size === t} onChange={() => set("shirt_size", t)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
              {t}
            </label>
          ))}
        </div>
      </Campo>

      <Campo label="Talla de sandalias" ayuda={REGISTRO.sandalias}>
        <div className="flex flex-wrap gap-2">
          {TALLAS_SANDALIA.map((t) => (
            <label key={t} className="cursor-pointer rounded px-3 py-2" style={{ position: "relative", background: f.sandal_size === String(t) ? COLOR.atlantico : "#fff", color: f.sandal_size === String(t) ? COLOR.alba : COLOR.atlantico, border: `1px solid ${f.sandal_size === String(t) ? COLOR.atlantico : COLOR.piedra}`, fontSize: 15 }}>
              <input type="radio" name="sandal" value={t} checked={f.sandal_size === String(t)} onChange={() => set("sandal_size", String(t))} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
              {t}
            </label>
          ))}
        </div>
        <GuiaDeTallas />
      </Campo>

      <Campo label="Restricciones en los alimentos" ayuda={REGISTRO.alimentacion}>
        <textarea value={f.dietary_notes} onChange={(e) => set("dietary_notes", e.target.value)} rows={3} style={{ ...INPUT, resize: "vertical" }} placeholder="Ninguna / alergia a…" required />
      </Campo>

      {confirmarNumero && numeroDistinto && (
        <p style={{ ...MAL, background: COLOR.piedra, color: COLOR.atlantico }}>
          El número que escribiste (<strong>{normalizarNumero(f.passport_number)}</strong>) no es el que leímos en la foto (<strong>{leido}</strong>). Si estás segura o seguro de que está bien, toca otra vez “Enviar”.
        </p>
      )}
      <button type="submit" disabled={estado === "enviando" || foto.estado === "subiendo" || foto.estado === "leyendo"} className="w-full rounded px-4 py-3" style={{ background: COLOR.ocreProfundo, color: COLOR.alba, border: 0, fontSize: 16, letterSpacing: 1, cursor: "pointer" }}>
        {estado === "enviando" ? "Enviando…" : confirmarNumero && numeroDistinto ? "Sí, el número está bien: enviar" : "Enviar mis datos"}
      </button>
    </form>
  );
}
