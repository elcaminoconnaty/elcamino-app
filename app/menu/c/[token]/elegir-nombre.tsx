"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COLOR } from "@/lib/brand";
import type { ListaDelCamino } from "@/lib/menus/por-token";

const CLAVE = "elcamino-menu-yo";

/**
 * La lista de nombres del camino. Al tocar el suyo, el peregrino pasa al formulario y el
 * navegador se lo recuerda para la próxima vez (el enlace es el mismo para todos).
 */
export function ElegirNombre({ token, lista }: { token: string; lista: ListaDelCamino }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState("");
  const [recordado, setRecordado] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(`${CLAVE}:${token}`);
      if (v && lista.peregrinos.some((p) => p.registration_id === v)) setRecordado(v);
    } catch {
      // sin localStorage (modo privado): se elige a mano
    }
  }, [token, lista.peregrinos]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLocaleLowerCase("es");
    return q ? lista.peregrinos.filter((p) => p.nombre.toLocaleLowerCase("es").includes(q)) : lista.peregrinos;
  }, [filtro, lista.peregrinos]);

  function entrar(registrationId: string) {
    try {
      window.localStorage.setItem(`${CLAVE}:${token}`, registrationId);
    } catch {
      // da igual
    }
    router.push(`/menu/c/${token}?yo=${registrationId}`);
  }

  const yo = recordado ? lista.peregrinos.find((p) => p.registration_id === recordado) : null;

  return (
    <div className="space-y-5">
      <section>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: COLOR.atlantico, margin: 0 }}>¿Quién eres?</h1>
        <p style={{ color: COLOR.castano, marginTop: 10, lineHeight: 1.6 }}>
          Toca tu nombre para elegir las cenas de <strong>{lista.camino}</strong>. Es un solo enlace para todo el grupo:
          por favor elige solo por ti.
        </p>
      </section>

      {yo && (
        <button
          type="button"
          onClick={() => entrar(yo.registration_id)}
          className="w-full rounded px-4 py-3 text-left"
          style={{ background: COLOR.atlantico, color: COLOR.alba, fontSize: 16 }}
        >
          Seguir como <strong>{yo.nombre}</strong> →
        </button>
      )}

      {lista.peregrinos.length > 6 && (
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Busca tu nombre…"
          className="w-full rounded px-3 py-2"
          style={{ border: `1px solid ${COLOR.piedra}`, background: "#fff", fontSize: 15, color: COLOR.atlantico }}
        />
      )}

      <ul className="space-y-1.5" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {visibles.map((p) => (
          <li key={p.registration_id}>
            <button
              type="button"
              onClick={() => entrar(p.registration_id)}
              className="w-full flex items-center justify-between gap-3 rounded px-4 py-3 text-left"
              style={{ background: "#fff", border: `1px solid ${COLOR.piedra}`, color: COLOR.atlantico, fontSize: 16 }}
            >
              <span>{p.nombre}</span>
              {lista.hayCenas && (
                <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: p.completo ? "#4A5E47" : COLOR.ocreProfundo }}>
                  {p.completo ? "listo" : "por elegir"}
                </span>
              )}
            </button>
          </li>
        ))}
        {visibles.length === 0 && (
          <li style={{ color: COLOR.castano, fontSize: 14 }}>No encontramos ese nombre. Escríbenos por WhatsApp y lo revisamos.</li>
        )}
      </ul>
    </div>
  );
}
