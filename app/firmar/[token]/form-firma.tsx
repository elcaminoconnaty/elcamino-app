"use client";

import { useState, useTransition } from "react";
import { COLOR, CONTACTO } from "@/lib/brand";
import { CONSENTIMIENTO } from "@/lib/contracts/consentimiento";
import { SignaturePad } from "@/components/contracts/signature-pad";
import type { ContratoParaFirmar } from "@/lib/contracts/sign";
import { accionFirmar, accionPedirCodigo } from "./actions";

/**
 * El formulario de firma.
 *
 * Tres pasos en una sola pantalla, en el orden en que la gente los hace: leer, aceptar y
 * dibujar, confirmar con el código. La validación es propia y en español (el `form` va
 * `noValidate`), y lleva al primer campo que falta en vez de dejar al firmante buscando.
 */
export function FormularioFirma({ token, contrato }: { token: string; contrato: ContratoParaFirmar }) {
  const [leyo, setLeyo] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [trazo, setTrazo] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [codigoPedido, setCodigoPedido] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [firmado, setFirmado] = useState<{ huella: string; url: string } | null>(null);
  const [pendiente, empezar] = useTransition();

  const pedir = () => {
    setError(null);
    if (!leyo || !acepta) return setError("Marca las dos casillas antes de pedir el código.");
    if (!trazo) return setError("Dibuja tu firma antes de pedir el código.");
    empezar(async () => {
      const r = await accionPedirCodigo(token);
      if (r.ok) {
        setCodigoPedido(true);
        setAviso(`Te mandamos un código a ${contrato.email}. Puede tardar un minuto en llegar.`);
      } else {
        setError(r.error ?? "No pude mandar el código.");
      }
    });
  };

  const firmar = () => {
    setError(null);
    if (!codigo.trim()) return setError("Escribe el código que te llegó al correo.");
    empezar(async () => {
      const r = await accionFirmar({
        token, codigo, trazoDataUrl: trazo!, aceptaLectura: leyo, aceptaFirma: acepta,
      });
      if (r.ok) setFirmado({ huella: r.huella, url: r.urlVerificacion });
      else setError(r.error);
    });
  };

  if (firmado) {
    return (
      <section className="rounded p-6" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: COLOR.atlantico, margin: 0 }}>
          Listo. Ya está firmado.
        </h1>
        <p style={{ color: COLOR.castano, marginTop: 12, lineHeight: 1.6 }}>
          Te mandamos la copia en PDF a <strong>{contrato.email}</strong>. Guárdala: es tuya.
          Al final del documento vas a encontrar el Informe de Firmas con todos los datos.
        </p>
        <p style={{ color: COLOR.castano, marginTop: 14, fontSize: 13 }}>
          Nos vemos en el Camino. Cualquier cosa, {CONTACTO.whatsapp}.
        </p>
        <div className="mt-5" style={{ fontSize: 11, color: COLOR.castano }}>
          <div style={{ letterSpacing: 1.4, textTransform: "uppercase", fontSize: 10, color: COLOR.ocre }}>
            Huella del documento
          </div>
          <code style={{ wordBreak: "break-all" }}>{firmado.huella}</code>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: COLOR.atlantico, margin: 0 }}>
          Hola, {contrato.nombre.split(" ")[0][0] + contrato.nombre.split(" ")[0].slice(1).toLowerCase()}
        </h1>
        <p style={{ color: COLOR.castano, marginTop: 10, lineHeight: 1.6 }}>
          Este es tu contrato del <strong>{contrato.camino}</strong>. Léelo con calma: si algo no te
          cuadra, escríbenos antes de firmar y lo vemos con calma.
        </p>
      </section>

      <section className="rounded p-4" style={{ background: COLOR.piedra, borderLeft: `3px solid ${COLOR.ocre}` }}>
        <Dato k="Camino" v={contrato.camino} />
        <Dato k="Valor" v={contrato.valorTotal} />
        <Dato k="Forma de pago" v={contrato.formaDePago} />
        <Dato k="Documento" v={contrato.documento} />
      </section>

      {/* 1 — Leer */}
      <section>
        <Paso n={1} titulo="Leé el contrato" />
        <div className="rounded overflow-hidden border" style={{ borderColor: COLOR.piedra }}>
          <iframe
            src={`/api/pdf/contrato/publico/${token}#view=FitH`}
            title="Contrato"
            className="w-full"
            style={{ height: 560, border: 0, background: "#fff" }}
          />
        </div>
        <p className="mt-2 text-xs" style={{ color: COLOR.castano }}>
          ¿Prefieres tenerlo en el celular?{" "}
          <a href={`/api/pdf/contrato/publico/${token}`} download style={{ color: COLOR.atlantico, textDecoration: "underline" }}>
            Descárgalo en PDF
          </a>
          .
        </p>
      </section>

      {/* 2 — Aceptar y firmar */}
      <section>
        <Paso n={2} titulo="Acepta y dibuja tu firma" />
        <label className="flex gap-3 items-start text-sm mb-3" style={{ color: COLOR.noche }}>
          <input type="checkbox" checked={leyo} onChange={(e) => setLeyo(e.target.checked)} className="mt-1" />
          <span>{CONSENTIMIENTO.lectura}</span>
        </label>
        <label className="flex gap-3 items-start text-sm mb-5" style={{ color: COLOR.noche }}>
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1" />
          <span>{CONSENTIMIENTO.firma}</span>
        </label>
        <SignaturePad onChange={setTrazo} disabled={pendiente || codigoPedido} />
      </section>

      {/* 3 — Confirmar */}
      <section>
        <Paso n={3} titulo="Confirmá con el código" />
        {!codigoPedido ? (
          <>
            <p className="text-sm mb-3" style={{ color: COLOR.castano }}>
              Te vamos a mandar un código de seis dígitos a <strong>{contrato.email}</strong>. Es lo que
              confirma que eres tú quien firma.
            </p>
            <Boton onClick={pedir} pendiente={pendiente}>Mándame el código</Boton>
          </>
        ) : (
          <>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              placeholder="______"
              className="rounded border px-4 py-3 mb-3 block"
              style={{
                borderColor: COLOR.piedra, background: "#fff", color: COLOR.noche,
                fontSize: 28, letterSpacing: 10, width: 220, textAlign: "center",
              }}
            />
            <Boton onClick={firmar} pendiente={pendiente}>Firmar el contrato</Boton>
            <button
              type="button"
              onClick={pedir}
              disabled={pendiente}
              className="ml-4 text-sm underline"
              style={{ color: COLOR.castano }}
            >
              Mándame otro código
            </button>
          </>
        )}
      </section>

      {aviso && <p className="text-sm" style={{ color: COLOR.musgo }}>{aviso}</p>}
      {error && (
        <p className="text-sm rounded p-3" style={{ background: "#F3E3E3", color: "#9B3D3D" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Paso({ n, titulo }: { n: number; titulo: string }) {
  return (
    <h2 className="mb-3" style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: COLOR.ocre }}>
      Paso {n} · {titulo}
    </h2>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 py-1 text-sm">
      <span style={{ color: COLOR.castano, minWidth: 120, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>{k}</span>
      <span style={{ color: COLOR.noche }}>{v}</span>
    </div>
  );
}

function Boton({ onClick, pendiente, children }: { onClick: () => void; pendiente: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pendiente}
      className="rounded px-6 py-3 disabled:opacity-50"
      style={{
        background: COLOR.ocre, color: COLOR.alba, fontSize: 12,
        letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700,
      }}
    >
      {pendiente ? "Un momento…" : children}
    </button>
  );
}
