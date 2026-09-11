"use client";

import { useMemo, useState, useTransition } from "react";
import { COLOR } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";
import { REGISTRO, TALLAS_CAMISETA, TALLAS_SANDALIA, INDICATIVOS } from "@/lib/registro/textos";
import type { FichaParaFormulario } from "@/lib/registro/por-token";
import { accionUrlPasaporte, accionLeerPasaporte, accionEnviarFormulario } from "./actions";

const INPUT: React.CSSProperties = { width: "100%", border: `1px solid ${COLOR.piedra}`, background: "#fff", borderRadius: 4, padding: "10px 12px", fontSize: 16, color: COLOR.atlantico };
const LABEL: React.CSSProperties = { display: "block", fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: COLOR.ocreProfundo, marginBottom: 6 };
const AYUDA: React.CSSProperties = { fontSize: 13, color: COLOR.castano, margin: "6px 0 0", lineHeight: 1.5 };

function Campo({ label, ayuda, obligatorio = true, children }: { label: string; ayuda?: string; obligatorio?: boolean; children: React.ReactNode }) {
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
  const hit = INDICATIVOS.find((i) => s.startsWith(i.code));
  if (hit) return { ind: hit.code, num: s.slice(hit.code.length).trim() };
  return { ind: "+57", num: s.replace(/^\+/, "") };
}

function edadDe(fecha: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const hoy = new Date();
  let e = hoy.getFullYear() - d.getFullYear();
  if (hoy < new Date(hoy.getFullYear(), d.getMonth(), d.getDate())) e--;
  return e >= 0 && e < 120 ? e : null;
}

/**
 * El formulario en sí. Por privacidad no llega prellenado con datos de nadie (el enlace
 * es el mismo para todo el grupo): solo el nombre y el correo.
 */
export function FormularioRegistro({ token, registrationId, ficha }: { token: string; registrationId: string; ficha: FichaParaFormulario }) {
  const [f, setF] = useState({
    full_name: ficha.nombre,
    email: ficha.email ?? "",
    telInd: "+57",
    telNum: "",
    birth_date: "",
    passport_number: "",
    nickname: "",
    address: "",
    instagram: "",
    emergency_contact_name: "",
    emergency_contact_relation: "",
    emInd: "+57",
    emNum: "",
    shirt_size: "",
    sandal_size: "",
    dietary_notes: "",
  });
  const [foto, setFoto] = useState<{ estado: "nada" | "subiendo" | "leyendo" | "lista" | "error"; mensaje?: string }>({ estado: ficha.tienePasaporte ? "lista" : "nada" });
  const [estado, setEstado] = useState<"idle" | "enviando" | "listo" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, empezar] = useTransition();
  const edad = useMemo(() => edadDe(f.birth_date), [f.birth_date]);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFoto({ estado: "error", mensaje: "Sube una foto (jpg o png)." });
      return;
    }
    setFoto({ estado: "subiendo" });
    try {
      const u = await accionUrlPasaporte({ token, registrationId, filename: file.name });
      if (!u.ok) throw new Error(u.error);
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from("passports").uploadToSignedUrl(u.path, u.uploadToken, file, { contentType: file.type });
      if (upErr) throw new Error("No se pudo subir la foto. Revisa tu conexión.");
      setFoto({ estado: "leyendo" });
      const r = await accionLeerPasaporte({ token, registrationId, path: u.path });
      if (!r.ok) throw new Error(r.error);
      setF((p) => ({
        ...p,
        passport_number: p.passport_number || (r.passport_number ?? ""),
        birth_date: p.birth_date || (r.birth_date ?? ""),
      }));
      setFoto({ estado: "lista", mensaje: r.passport_number ? "Leímos tu pasaporte; revisa que el número y la fecha estén bien." : "Foto guardada." });
    } catch (err: any) {
      setFoto({ estado: "error", mensaje: err?.message ?? "No se pudo subir la foto." });
    }
  }

  function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const falta = foto.estado !== "lista" ? "Falta la foto de tu pasaporte." : !f.shirt_size ? "Elige tu talla de camiseta." : !f.sandal_size ? "Elige tu talla de sandalias." : null;
    if (falta) {
      setError(falta);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      <section className="rounded p-6" style={{ background: "#e6efe8", borderLeft: `3px solid ${COLOR.musgo}` }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, color: COLOR.atlantico, margin: 0 }}>¡Gracias, {f.nickname || f.full_name.split(" ")[0]}!</h1>
        <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>{REGISTRO.gracias}</p>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-6">
      <section>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: COLOR.atlantico, margin: 0 }}>Hola, {ficha.nombre.split(" ")[0]}</h1>
        <p style={{ color: COLOR.castano, marginTop: 10, lineHeight: 1.6 }}>
          Estos son los datos que necesitamos para <strong>{ficha.camino}</strong>: reservas, contrato y kit de peregrino.
          {ficha.enviadoEl && " Ya los habías enviado; si algo cambió, corrígelo y vuelve a enviar."}
        </p>
        {error && <p className="mt-3 rounded px-3 py-2" style={{ background: "#f6e0dd", color: "#9b2c2c", fontSize: 14 }}>{error}</p>}
      </section>

      <Campo label="Nombre completo y apellidos">
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

      <Campo label="Foto de tu pasaporte" ayuda={REGISTRO.pasaporte}>
        <div className="rounded p-4" style={{ background: "#fff", border: `1px dashed ${COLOR.ocre}` }}>
          {foto.estado === "lista" && (
            <p style={{ color: "#4A5E47", fontSize: 14, margin: "0 0 8px" }}>✓ {foto.mensaje ?? "Ya tenemos tu pasaporte. Súbelo de nuevo solo si cambió."}</p>
          )}
          {foto.estado === "error" && <p style={{ color: "#9b2c2c", fontSize: 14, margin: "0 0 8px" }}>{foto.mensaje}</p>}
          {(foto.estado === "subiendo" || foto.estado === "leyendo") && (
            <p style={{ color: COLOR.castano, fontSize: 14, margin: "0 0 8px" }}>{foto.estado === "subiendo" ? "Subiendo la foto…" : "Leyendo el pasaporte…"}</p>
          )}
          <input type="file" accept="image/*" capture="environment" onChange={subirFoto} disabled={foto.estado === "subiendo" || foto.estado === "leyendo"} style={{ fontSize: 14, color: COLOR.atlantico }} />
        </div>
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Número de pasaporte">
          <input value={f.passport_number} onChange={(e) => set("passport_number", e.target.value.toUpperCase())} style={INPUT} required />
        </Campo>
        <Campo label="Fecha de nacimiento" ayuda={edad != null ? `${edad} años` : undefined}>
          <input type="date" value={f.birth_date} onChange={(e) => set("birth_date", e.target.value)} style={INPUT} required />
        </Campo>
      </div>

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

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Talla de camiseta">
          <div className="flex flex-wrap gap-2">
            {TALLAS_CAMISETA.map((t) => (
              <label key={t} className="cursor-pointer rounded px-4 py-2" style={{ background: f.shirt_size === t ? COLOR.atlantico : "#fff", color: f.shirt_size === t ? COLOR.alba : COLOR.atlantico, border: `1px solid ${f.shirt_size === t ? COLOR.atlantico : COLOR.piedra}`, fontSize: 15 }}>
                <input type="radio" name="shirt" value={t} checked={f.shirt_size === t} onChange={() => set("shirt_size", t)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                {t}
              </label>
            ))}
          </div>
        </Campo>
        <Campo label="Talla de sandalias" ayuda={REGISTRO.sandalias}>
          <div className="flex flex-wrap gap-2">
            {TALLAS_SANDALIA.map((t) => (
              <label key={t} className="cursor-pointer rounded px-3 py-2" style={{ background: f.sandal_size === String(t) ? COLOR.atlantico : "#fff", color: f.sandal_size === String(t) ? COLOR.alba : COLOR.atlantico, border: `1px solid ${f.sandal_size === String(t) ? COLOR.atlantico : COLOR.piedra}`, fontSize: 15 }}>
                <input type="radio" name="sandal" value={t} checked={f.sandal_size === String(t)} onChange={() => set("sandal_size", String(t))} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                {t}
              </label>
            ))}
          </div>
          {REGISTRO.guiaSandaliasUrl && (
            <a href={REGISTRO.guiaSandaliasUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 13, color: COLOR.ocreProfundo, textDecoration: "underline" }}>Ver la guía de tallas</a>
          )}
        </Campo>
      </div>

      <Campo label="Restricciones en los alimentos" ayuda={REGISTRO.alimentacion}>
        <textarea value={f.dietary_notes} onChange={(e) => set("dietary_notes", e.target.value)} rows={3} style={{ ...INPUT, resize: "vertical" }} placeholder="Ninguna / alergia a…" required />
      </Campo>

      <button type="submit" disabled={estado === "enviando"} className="w-full rounded px-4 py-3" style={{ background: COLOR.ocreProfundo, color: COLOR.alba, border: 0, fontSize: 16, letterSpacing: 1, cursor: "pointer" }}>
        {estado === "enviando" ? "Enviando…" : "Enviar mis datos"}
      </button>
    </form>
  );
}
