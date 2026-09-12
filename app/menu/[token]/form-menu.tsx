"use client";

import { useState, useTransition } from "react";
import { COLOR } from "@/lib/brand";
import {
  courseTitle, menuIsEmpty, menuNeedsChoice, courseApplies, requiredCoursesFor, applyChoice, dependentsOf,
} from "@/lib/data/menus";
import type { CenaParaElegir, MenuParaElegir } from "@/lib/menus/por-token";
import { accionElegir, accionNoCena, accionEnviar } from "./actions";
import { accionElegirCamino, accionNoCenaCamino, accionEnviarCamino } from "@/app/menu/c/[token]/actions";

/** Por dónde entró: enlace personal (solo token) o enlace del camino (token + inscripción). */
export type ContextoMenu = { token: string; registrationId?: string | null };

type Estado = { tipo: "idle" | "guardando" | "guardado" | "error"; mensaje?: string };

/**
 * Una tarjeta por cena, con un radio por plato. Cada elección se guarda sola (en el
 * celular es más natural que ir hasta el final para no perder nada), y al final está el
 * botón "Enviar", que es el que cierra: le dice al equipo que esta persona ya terminó y
 * que se le puede mandar la lista al restaurante. Se puede volver a enviar si cambia algo.
 * Los platos que van igual para todos se muestran como información; los que se eligen
 * en el restaurante también; las secciones condicionales aparecen solo cuando aplican.
 */
export function FormularioMenu({ token, ctx, datos }: { token?: string; ctx?: ContextoMenu; datos: MenuParaElegir }) {
  const acceso: ContextoMenu = ctx ?? { token: token ?? "" };
  const elegirEnServidor = (args: { reservationId: string; courseId: string; optionId: string | null }) =>
    acceso.registrationId
      ? accionElegirCamino({ token: acceso.token, registrationId: acceso.registrationId, ...args })
      : accionElegir({ token: acceso.token, ...args });
  const noCenaEnServidor = (args: { reservationId: string; noCena: boolean }) =>
    acceso.registrationId
      ? accionNoCenaCamino({ token: acceso.token, registrationId: acceso.registrationId, ...args })
      : accionNoCena({ token: acceso.token, ...args });
  const enviarEnServidor = () =>
    acceso.registrationId
      ? accionEnviarCamino({ token: acceso.token, registrationId: acceso.registrationId })
      : accionEnviar({ token: acceso.token });
  const [cenas, setCenas] = useState<CenaParaElegir[]>(datos.cenas);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [enviado, setEnviado] = useState<string | null>(datos.enviadoEl);
  /** Cambió algo después de haber enviado: hay que volver a enviar. */
  const [sinEnviar, setSinEnviar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  /** Con cenas sin elegir, el botón pide un segundo toque antes de mandar. */
  const [confirmar, setConfirmar] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [, empezar] = useTransition();

  const conMenu = cenas.filter((c) => !menuIsEmpty(c.courses));
  const faltan = conMenu.filter((c) => {
    if (c.noCena || !menuNeedsChoice(c.courses)) return false;
    return requiredCoursesFor(c.courses, c.elegido).some((x) => !c.elegido[x.id]);
  }).length;

  function setEstado(id: string, e: Estado) {
    setEstados((prev) => ({ ...prev, [id]: e }));
    if (e.tipo === "guardado" && enviado) setSinEnviar(true);
  }

  /** Lo que eligió en una cena, en una línea, para el resumen del final. */
  function resumenDe(cena: CenaParaElegir): string {
    if (cena.noCena) return "No cenas esa noche";
    if (menuIsEmpty(cena.courses)) return "Todavía sin menú";
    const partes: string[] = [];
    for (const c of cena.courses) {
      if (!courseApplies(c, cena.elegido, cena.courses)) continue;
      if (c.mode === "fijo") {
        if (c.options[0]) partes.push(c.options[0].name);
        continue;
      }
      if (c.mode === "en_sitio") continue;
      const elegido = c.options.find((o) => o.id === cena.elegido[c.id]);
      if (elegido) partes.push(elegido.name);
      else if (c.required) partes.push("— falta elegir —");
    }
    return partes.join(" · ") || "Sin nada elegido";
  }

  function enviar() {
    // Un confirm del navegador en el celular es un modal feo y a pantalla completa; acá
    // basta con pedir el segundo toque, como en el editor de menú del equipo.
    if (faltan > 0 && !confirmar) {
      setConfirmar(true);
      return;
    }
    setEnviando(true);
    setErrorEnvio(null);
    empezar(async () => {
      const r = await enviarEnServidor();
      if (r.ok) {
        setEnviado(new Date().toISOString());
        setSinEnviar(false);
        setConfirmar(false);
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      } else {
        setErrorEnvio(r.error);
      }
      setEnviando(false);
    });
  }

  function elegir(cena: CenaParaElegir, courseId: string, optionId: string) {
    const anterior = cena.elegido;
    const nuevo = (anterior[courseId] ?? "") === optionId ? "" : optionId;
    const siguiente = applyChoice(anterior, courseId, nuevo, cena.courses);
    setCenas((prev) => prev.map((c) => (c.id === cena.id ? { ...c, noCena: false, elegido: siguiente } : c)));
    setEstado(cena.id, { tipo: "guardando" });
    empezar(async () => {
      const r = await elegirEnServidor({ reservationId: cena.id, courseId, optionId: nuevo || null });
      if (r.ok) setEstado(cena.id, { tipo: "guardado" });
      else {
        setEstado(cena.id, { tipo: "error", mensaje: r.error });
        setCenas((prev) => prev.map((c) => (c.id === cena.id ? { ...c, elegido: anterior } : c)));
      }
    });
  }

  function noCena(cena: CenaParaElegir, valor: boolean) {
    setCenas((prev) => prev.map((c) => (c.id === cena.id ? { ...c, noCena: valor, elegido: valor ? {} : c.elegido } : c)));
    setEstado(cena.id, { tipo: "guardando" });
    empezar(async () => {
      const r = await noCenaEnServidor({ reservationId: cena.id, noCena: valor });
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
          Estas son las cenas de <strong>{datos.camino}</strong>. Elige tu plato en cada sección; puedes cambiarlo hasta que
          mandemos la lista al restaurante. Se guarda solo con cada elección.
        </p>
        <p style={{ color: COLOR.castano, marginTop: 8, lineHeight: 1.6, fontSize: 14 }}>
          Caminaremos entre pueblitos y, al ser un grupo, las opciones pueden ser más limitadas de lo habitual. Te
          invitamos a valorar con gratitud cada plato: hace parte de descubrir nuevas culturas y sabores. Si no reconoces
          un plato, búscalo en internet para elegir mejor.
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
        const nadaQueElegir = !sinMenu && !menuNeedsChoice(cena.courses);
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

            {cena.nota && (
              <p
                className="mt-3 rounded px-3 py-2"
                style={{ background: COLOR.alba, borderLeft: `3px solid ${COLOR.ocre}`, color: COLOR.castano, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line", margin: "12px 0 0" }}
              >
                {cena.nota}
              </p>
            )}

            {sinMenu ? (
              <p className="mt-3" style={{ color: COLOR.castano, fontSize: 14, lineHeight: 1.6 }}>
                El restaurante todavía no nos mandó el menú; te avisamos cuando esté para que elijas.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {nadaQueElegir && (
                  <p style={{ color: COLOR.castano, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                    Esta noche el menú es igual para todos; no tienes que elegir nada.
                  </p>
                )}
                {cena.courses.map((course) => {
                  if (!courseApplies(course, cena.elegido, cena.courses)) return null;
                  const titulo = courseTitle(course);
                  if (course.mode === "fijo") {
                    const plato = course.options[0];
                    if (!plato) return null;
                    return (
                      <div key={course.id} style={{ fontSize: 14, color: COLOR.castano }}>
                        <span style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: COLOR.ocreProfundo }}>{titulo}</span>
                        <div style={{ color: COLOR.atlantico, fontSize: 15 }}>
                          {plato.name} <span style={{ color: COLOR.castano, fontSize: 12 }}>· igual para todos</span>
                        </div>
                        {plato.description && <div style={{ fontSize: 12 }}>{plato.description}</div>}
                      </div>
                    );
                  }
                  if (course.mode === "en_sitio") {
                    return (
                      <div key={course.id} style={{ fontSize: 14, color: COLOR.castano }}>
                        <span style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: COLOR.ocreProfundo }}>{titulo}</span>
                        <div>Se elige en el restaurante.</div>
                      </div>
                    );
                  }
                  if (course.options.length === 0) return null;
                  const hijas = dependentsOf(course, cena.courses);
                  return (
                    <fieldset key={course.id} disabled={cena.noCena} style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend style={{ fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: COLOR.ocreProfundo, marginBottom: 6 }}>
                        {titulo}
                        {!course.required && <span style={{ textTransform: "none", letterSpacing: 0, color: COLOR.castano }}> · opcional</span>}
                      </legend>
                      <div className="space-y-1.5">
                        {course.options.map((o) => {
                          const activo = cena.elegido[course.id] === o.id;
                          const abre = hijas.filter((h) => h.depends_on_option_id === o.id && h.mode === "peregrino").length;
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
                                {abre > 0 && !activo && (
                                  <span style={{ display: "block", fontSize: 12, color: COLOR.castano }}>Al elegirlo te pedimos {abre === 1 ? "un plato más" : `${abre} platos más`}.</span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            )}

            <label className="mt-4 flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, color: COLOR.castano }}>
              <input type="checkbox" checked={cena.noCena} onChange={(e) => noCena(cena, e.target.checked)} />
              No voy a cenar esta noche
            </label>
          </section>
        );
      })}

      {cenas.length > 0 && (
        <section className="rounded p-5" style={{ background: "#fff", border: `1px solid ${COLOR.piedra}` }}>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 21, color: COLOR.atlantico, margin: 0 }}>Esto es lo que vamos a pedir</h2>
          <ul className="mt-3 space-y-1.5" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
            {cenas.map((cena) => (
              <li key={cena.id} style={{ fontSize: 14, color: COLOR.castano, lineHeight: 1.5 }}>
                <strong style={{ color: COLOR.atlantico }}>{cena.restaurante}</strong>
                {cena.fecha ? ` · ${cena.fecha}` : ""}
                <span style={{ display: "block" }}>{resumenDe(cena)}</span>
              </li>
            ))}
          </ul>

          {enviado && !sinEnviar ? (
            <p className="mt-4 rounded px-3 py-2" style={{ background: "#e6efe8", color: COLOR.atlantico, fontSize: 14, lineHeight: 1.6 }}>
              ¡Gracias! Ya recibimos tu elección. Si algo cambia, corrígelo acá arriba y vuelve a tocar Enviar.
            </p>
          ) : (
            <p className="mt-4" style={{ fontSize: 14, color: COLOR.castano, lineHeight: 1.6 }}>
              {sinEnviar
                ? "Cambiaste algo después de enviar: toca Enviar otra vez para que nos llegue."
                : "Cuando termines, toca Enviar y le pasamos tu elección al restaurante."}
            </p>
          )}

          {faltan > 0 && confirmar && (
            <p className="mt-2 rounded px-3 py-2" style={{ background: COLOR.piedra, color: COLOR.atlantico, fontSize: 14, lineHeight: 1.6 }}>
              Te falta{faltan > 1 ? "n" : ""} {faltan} cena{faltan > 1 ? "s" : ""} por elegir. Toca otra vez para enviarlo así; puedes volver a este enlace y completarlo después.
            </p>
          )}

          {errorEnvio && <p className="mt-2" style={{ color: "#9b2c2c", fontSize: 14 }}>{errorEnvio}</p>}

          <button
            type="button"
            onClick={enviar}
            disabled={enviando}
            className="mt-3 w-full rounded px-4 py-3"
            style={{
              background: enviado && !sinEnviar ? COLOR.piedra : COLOR.ocreProfundo,
              color: enviado && !sinEnviar ? COLOR.atlantico : COLOR.alba,
              border: 0,
              fontSize: 16,
              letterSpacing: 1,
              cursor: enviando ? "default" : "pointer",
            }}
          >
            {enviando
              ? "Enviando…"
              : faltan > 0 && confirmar
                ? "Enviar así"
                : enviado && !sinEnviar
                  ? "Enviado ✓ · volver a enviar"
                  : sinEnviar
                    ? "Volver a enviar"
                    : "Enviar mi elección"}
          </button>
        </section>
      )}
    </div>
  );
}
