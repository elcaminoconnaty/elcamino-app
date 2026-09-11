"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COLOR } from "@/lib/brand";
import { REGISTRO } from "@/lib/registro/textos";
import type { ListaRegistro } from "@/lib/registro/por-token";
import { accionSolicitar } from "./actions";

const INPUT: React.CSSProperties = { width: "100%", border: `1px solid ${COLOR.piedra}`, background: "#fff", borderRadius: 4, padding: "10px 12px", fontSize: 15, color: COLOR.atlantico };

/** La lista de nombres del camino y, para quien no esté, una solicitud al equipo. */
export function ElegirNombreRegistro({ token, lista }: { token: string; lista: ListaRegistro }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState("");
  const [noEstoy, setNoEstoy] = useState(false);
  const [sol, setSol] = useState({ full_name: "", email: "", phone: "", mensaje: "" });
  const [estado, setEstado] = useState<"idle" | "enviando" | "listo" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, empezar] = useTransition();

  const visibles = useMemo(() => {
    const q = filtro.trim().toLocaleLowerCase("es");
    return q ? lista.peregrinos.filter((p) => p.nombre.toLocaleLowerCase("es").includes(q)) : lista.peregrinos;
  }, [filtro, lista.peregrinos]);

  function solicitar() {
    setEstado("enviando");
    setError(null);
    empezar(async () => {
      const r = await accionSolicitar({ token, datos: sol });
      if (r.ok) setEstado("listo");
      else {
        setEstado("error");
        setError(r.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: COLOR.atlantico, margin: 0 }}>¡Bienvenida, peregrina!</h1>
        {REGISTRO.bienvenida.map((p, i) => (
          <p key={i} style={{ color: COLOR.castano, marginTop: i === 0 ? 10 : 8, lineHeight: 1.6, fontSize: i === 0 ? 16 : 15 }}>{p}</p>
        ))}
        <p style={{ color: COLOR.atlantico, marginTop: 12, lineHeight: 1.6 }}>
          Toca tu nombre para llenar tus datos de <strong>{lista.camino}</strong>.
        </p>
      </section>

      {lista.peregrinos.length > 6 && (
        <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Busca tu nombre…" style={INPUT} />
      )}

      <ul className="space-y-1.5" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {visibles.map((p) => (
          <li key={p.registration_id}>
            <button
              type="button"
              onClick={() => router.push(`/registro/${token}?yo=${p.registration_id}`)}
              className="w-full flex items-center justify-between gap-3 rounded px-4 py-3 text-left"
              style={{ background: "#fff", border: `1px solid ${COLOR.piedra}`, color: COLOR.atlantico, fontSize: 16 }}
            >
              <span>{p.nombre}</span>
              <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: p.completo ? "#4A5E47" : COLOR.ocreProfundo }}>
                {p.completo ? "listo" : "por llenar"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <section className="rounded p-5" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
        {!noEstoy ? (
          <button type="button" onClick={() => setNoEstoy(true)} style={{ background: "none", border: 0, padding: 0, color: COLOR.ocreProfundo, textDecoration: "underline", fontSize: 14, cursor: "pointer" }}>
            No estoy en la lista
          </button>
        ) : estado === "listo" ? (
          <p style={{ color: COLOR.atlantico, margin: 0, lineHeight: 1.6 }}>Recibimos tu solicitud. Te escribimos por WhatsApp para completar tu inscripción.</p>
        ) : (
          <div className="space-y-2">
            <p style={{ color: COLOR.castano, margin: 0, fontSize: 14, lineHeight: 1.6 }}>Déjanos tus datos y te agregamos:</p>
            <input value={sol.full_name} onChange={(e) => setSol({ ...sol, full_name: e.target.value })} placeholder="Nombre completo" style={INPUT} />
            <input value={sol.email} onChange={(e) => setSol({ ...sol, email: e.target.value })} placeholder="Correo" type="email" style={INPUT} />
            <input value={sol.phone} onChange={(e) => setSol({ ...sol, phone: e.target.value })} placeholder="Celular con indicativo" style={INPUT} />
            <input value={sol.mensaje} onChange={(e) => setSol({ ...sol, mensaje: e.target.value })} placeholder="Algo que debamos saber (opcional)" style={INPUT} />
            {error && <p style={{ color: "#9b2c2c", fontSize: 13, margin: 0 }}>{error}</p>}
            <button type="button" onClick={solicitar} disabled={estado === "enviando"} className="rounded px-4 py-2" style={{ background: COLOR.ocreProfundo, color: COLOR.alba, border: 0, fontSize: 14, cursor: "pointer" }}>
              {estado === "enviando" ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
