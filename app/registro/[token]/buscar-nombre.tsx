"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COLOR, ESTADO } from "@/lib/brand";
import { REGISTRO } from "@/lib/registro/textos";
import { accionBuscarNombre, accionSolicitar } from "./actions";

const INPUT: React.CSSProperties = { width: "100%", border: `1px solid ${COLOR.piedra}`, background: "#fff", borderRadius: 4, padding: "12px 14px", fontSize: 16, color: COLOR.atlantico };

const MOTIVO: Record<string, string> = {
  corto: "Escribe tu nombre y tu apellido.",
  varios: "Hay más de una persona con ese nombre. Escríbelo completo, con tus dos apellidos.",
  ninguno: "No te encontramos con ese nombre. Revisa cómo lo escribiste (como aparece en tu pasaporte) o avísanos abajo.",
  enlace: "Este enlace ya no funciona. Pídenos uno nuevo por WhatsApp.",
  personal: "Ya tenemos tus datos o ya te mandamos tu enlace personal por WhatsApp. Entra por ese enlace para corregir algo, o escríbenos.",
};

/**
 * El enlace del camino: la persona escribe su nombre y entra a SU formulario. No se muestra
 * la lista del grupo (nadie tiene por qué ver quién más viaja).
 */
export function BuscarNombre({ token, camino }: { token: string; camino: string }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [buscando, empezar] = useTransition();
  const [noEstoy, setNoEstoy] = useState(false);
  const [sol, setSol] = useState({ full_name: "", email: "", phone: "", mensaje: "" });
  const [estadoSol, setEstadoSol] = useState<"idle" | "enviando" | "listo" | "error">("idle");
  const [errorSol, setErrorSol] = useState<string | null>(null);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await accionBuscarNombre({ token, nombre });
      if (r.ok) router.push(`/registro/${token}?yo=${r.registrationId}`);
      else {
        setError(MOTIVO[r.motivo]);
        if (r.motivo === "ninguno") setSol((s) => ({ ...s, full_name: s.full_name || nombre }));
      }
    });
  }

  function solicitar() {
    setEstadoSol("enviando");
    setErrorSol(null);
    empezar(async () => {
      const r = await accionSolicitar({ token, datos: sol });
      if (r.ok) setEstadoSol("listo");
      else {
        setEstadoSol("error");
        setErrorSol(r.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-display" style={{ fontSize: 34, color: COLOR.atlantico, margin: 0, lineHeight: 1.1 }}>Te damos la bienvenida</h1>
        {REGISTRO.bienvenida.map((p, i) => (
          <p key={i} style={{ color: COLOR.castano, marginTop: i === 0 ? 12 : 8, lineHeight: 1.6, fontSize: i === 0 ? 17 : 15 }}>{p}</p>
        ))}
      </section>

      <form onSubmit={buscar} className="rounded p-5 space-y-3" style={{ background: "#fff", border: `1px solid ${COLOR.piedra}` }}>
        <label htmlFor="nombre" style={{ display: "block", fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: COLOR.ocreProfundo }}>
          Tu nombre y apellido
        </label>
        <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} style={INPUT} autoComplete="name" placeholder="Como aparece en tu pasaporte" required />
        {error && <p style={{ color: ESTADO.error, fontSize: 14, margin: 0, lineHeight: 1.5 }}>{error}</p>}
        <button type="submit" disabled={buscando} className="w-full rounded px-4 py-3" style={{ background: COLOR.ocreProfundo, color: COLOR.alba, border: 0, fontSize: 16, letterSpacing: 1, cursor: "pointer" }}>
          {buscando ? "Buscando…" : `Llenar mis datos de ${camino}`}
        </button>
      </form>

      <section className="rounded p-5" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
        {!noEstoy ? (
          <button type="button" onClick={() => setNoEstoy(true)} style={{ background: "none", border: 0, padding: 0, color: COLOR.ocreProfundo, textDecoration: "underline", fontSize: 14, cursor: "pointer" }}>
            No me encuentro
          </button>
        ) : estadoSol === "listo" ? (
          <p style={{ color: COLOR.atlantico, margin: 0, lineHeight: 1.6 }}>Recibimos tu solicitud. Te escribimos por WhatsApp para completar tu inscripción.</p>
        ) : (
          <div className="space-y-2">
            <p style={{ color: COLOR.castano, margin: 0, fontSize: 14, lineHeight: 1.6 }}>Déjanos tus datos y te agregamos:</p>
            <input value={sol.full_name} onChange={(e) => setSol({ ...sol, full_name: e.target.value })} placeholder="Nombre completo" style={INPUT} />
            <input value={sol.email} onChange={(e) => setSol({ ...sol, email: e.target.value })} placeholder="Correo" type="email" style={INPUT} />
            <input value={sol.phone} onChange={(e) => setSol({ ...sol, phone: e.target.value })} placeholder="Celular con indicativo" style={INPUT} />
            <input value={sol.mensaje} onChange={(e) => setSol({ ...sol, mensaje: e.target.value })} placeholder="Algo que debamos saber (opcional)" style={INPUT} />
            {errorSol && <p style={{ color: ESTADO.error, fontSize: 13, margin: 0 }}>{errorSol}</p>}
            <button type="button" onClick={solicitar} disabled={estadoSol === "enviando"} className="rounded px-4 py-2" style={{ background: COLOR.ocreProfundo, color: COLOR.alba, border: 0, fontSize: 14, cursor: "pointer" }}>
              {estadoSol === "enviando" ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
