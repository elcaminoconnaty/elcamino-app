"use client";

import { useState, useTransition } from "react";
import { COLOR } from "@/lib/brand";
import { courseTitle, menuIsEmpty } from "@/lib/data/menus";
import type { CenaParaElegir, MenuParaElegir } from "@/lib/menus/por-token";
import { accionElegir, accionNoCena } from "./actions";

type Estado = { tipo: "idle" | "guardando" | "guardado" | "error"; mensaje?: string };

/**
 * Una tarjeta por cena, con un radio por plato. Se guarda con cada cambio (en el celular
 * es más natural que un botón al final) y cada tarjeta muestra si quedó guardado.
 */
export function FormularioMenu({ token, datos }: { token: string; datos: MenuParaElegir }) {
  const [cenas, setCenas] = useState<CenaParaElegir[]>(datos.cenas);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [, empezar] = useTransition();

  const conMenu = cenas.filter((c) => !menuIsEmpty(c.courses));
  const faltan = conMenu.filter((c) => {
    if (c.noCena) return false;
    const obligatorias = c.courses.filter((x) => x.required && x.options.length > 0);
    return obligatorias.some((x) => !c.elegido[x.id]);
  }).length;

  function setEstado(id: string, e: Estado) {
    setEstados((prev) => ({ ...prev, [id]: e }));
  }

  function elegir(cena: CenaParaElegir, courseId: string, optionId: string) {
    const anterior = cena.elegido[courseId] ?? "";
    const nuevo = anterior === optionId ? "" : optionId;
    setCenas((prev) => prev.map((c) => (c.id === cena.id ? { ...c, noCena: false, elegido: { ...c.elegido, [courseId]: nuevo } } : c)));
    setEstado(cena.id, { tipo: "guardando" });
    empezar(async () => {
      const r = await accionElegir({ token, reservationId: cena.id, courseId, optionId: nuevo || null });
      if (r.ok) setEstado(cena.id, { tipo: "guardado" });
      else {
        setEstado(cena.id, { tipo: "error", mensaje: r.error });
        setCenas((prev) => prev.map((c) => (c.id === cena.id ? { ...c, elegido: { ...c.elegido, [courseId]: anterior } } : c)));
      }
    });
  }

  function noCena(cena: CenaParaElegir, valor: boolean) {
    setCenas((prev) => prev.map((c) => (c.id === cena.id ? { ...c, noCena: valor, elegido: valor ? {} : c.elegido } : c)));
    setEstado(cena.id, { tipo: "guardando" });
    empezar(async () => {
      const r = await accionNoCena({ token, reservationId: cena.id, noCena: valor });
      if (r.ok) setEstado(cena.id, { tipo: "guardado" });
      else {
        setEstado(cena.id, { tipo: "error", mensaje: r.error });
        setCenas((prev) => prev.map((c) => (c.id === cena.id ? { ...c, noCena: !valor } : c)));
      }
    });
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: COLOR.atlantico, margin: 0 }}>
          Hola, {datos.nombre.split(" ")[0]}
        </h1>
        <p style={{ color: COLOR.castano, marginTop: 10, lineHeight: 1.6 }}>
          Estas son las cenas de <strong>{datos.camino}</strong>. Elige un plato en cada sección; puedes cambiarlo
          hasta que mandemos la lista al restaurante. Se guarda solo con cada elección.
        </p>
        {conMenu.length > 0 && (
          <p
            className="mt-3 rounded px-3 py-2 text-sm"
            style={{ background: faltan === 0 ? "#e6efe8" : COLOR.piedra, color: COLOR.atlantico }}
          >
            {faltan === 0
              ? "Ya elegiste en todas las cenas que tienen menú. ¡Gracias!"
              : `Te falta${faltan > 1 ? "n" : ""} ${faltan} cena${faltan > 1 ? "s" : ""} por elegir.`}
          </p>
        )}
      </section>

      {cenas.length === 0 && (
        <section className="rounded p-5" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
          <p style={{ color: COLOR.castano, margin: 0, lineHeight: 1.6 }}>
            Todavía no hay cenas cargadas para tu camino. Te avisamos cuando estén.
          </p>
        </section>
      )}

      {cenas.map((cena) => {
        const estado = estados[cena.id] ?? { tipo: "idle" };
        const sinMenu = menuIsEmpty(cena.courses);
        return (
          <section
            key={cena.id}
            className="rounded p-5"
            style={{ background: "#fff", border: `1px solid ${COLOR.piedra}`, opacity: cena.noCena ? 0.75 : 1 }}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: COLOR.ocreProfundo }}>
                  {cena.dia != null ? `DÍA ${cena.dia} · ` : ""}{cena.fecha.toUpperCase()}
                </div>
                <h2 style={{ fontFamily: "Georgia, serif", fontSize: 21, color: COLOR.atlantico, margin: "4px 0 0" }}>
                  {cena.restaurante}
                  {cena.delHotel && <span style={{ fontSize: 13, color: COLOR.castano, fontFamily: "inherit" }}> · cena del hotel</span>}
                </h2>
                {cena.lugar && <div style={{ fontSize: 13, color: COLOR.castano }}>{cena.lugar}</div>}
              </div>
              <div style={{ fontSize: 12, color: estado.tipo === "error" ? "#9b2c2c" : COLOR.castano, minHeight: 18 }}>
                {estado.tipo === "guardando" && "Guardando…"}
                {estado.tipo === "guardado" && "Guardado ✓"}
                {estado.tipo === "error" && (estado.mensaje ?? "No se pudo guardar")}
              </div>
            </div>

            {sinMenu ? (
              <p className="mt-3" style={{ color: COLOR.castano, fontSize: 14, lineHeight: 1.6 }}>
                El restaurante todavía no nos mandó el menú; te avisamos cuando esté para que elijas.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {cena.courses.map((course) => (
                  <fieldset key={course.id} disabled={cena.noCena} style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: COLOR.ocreProfundo, marginBottom: 6 }}>
                      {courseTitle(course)}
                      {!course.required && <span style={{ textTransform: "none", letterSpacing: 0, color: COLOR.castano }}> · opcional</span>}
                    </legend>
                    <div className="space-y-1.5">
                      {course.options.map((o) => {
                        const activo = cena.elegido[course.id] === o.id;
                        return (
                          <label
                            key={o.id}
                            className="flex items-start gap-3 rounded px-3 py-2 cursor-pointer"
                            style={{
                              background: activo ? COLOR.piedra : "transparent",
                              border: `1px solid ${activo ? COLOR.ocre : COLOR.piedra}`,
                            }}
                          >
                            <input
                              type="radio"
                              name={`${cena.id}-${course.id}`}
                              checked={activo}
                              onChange={() => elegir(cena, course.id, o.id)}
                              onClick={() => activo && elegir(cena, course.id, o.id)}
                              style={{ marginTop: 3 }}
                            />
                            <span>
                              <span style={{ color: COLOR.atlantico, fontSize: 15 }}>{o.name}</span>
                              {o.description && <span style={{ display: "block", fontSize: 12, color: COLOR.castano }}>{o.description}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}

            <label className="mt-4 flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, color: COLOR.castano }}>
              <input type="checkbox" checked={cena.noCena} onChange={(e) => noCena(cena, e.target.checked)} />
              No voy a cenar esta noche
            </label>
          </section>
        );
      })}
    </div>
  );
}
