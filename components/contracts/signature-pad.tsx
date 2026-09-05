"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COLOR } from "@/lib/brand";

/**
 * El recuadro donde el peregrino dibuja su firma.
 *
 * Va con Pointer Events, no con eventos de ratón: la mayoría firma con el dedo en el
 * celular, y `touch-action: none` es lo que impide que el gesto haga scroll de la página
 * en vez de dibujar.
 *
 * El trazo se entrega como PNG en data URL. No es un adorno: ZapSign, que es lo que venían
 * usando, no captura trazo. Tenerlo es evidencia de más, no de menos.
 */
export function SignaturePad({
  onChange,
  disabled,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [conTrazo, setConTrazo] = useState(false);

  // El canvas se dibuja al doble de resolución para que la firma no salga pixelada en
  // pantallas retina ni al imprimirla dentro del PDF.
  const preparar = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const ancho = c.parentElement?.clientWidth ?? 560;
    const alto = 180;
    c.width = ancho * 2;
    c.height = alto * 2;
    c.style.width = `${ancho}px`;
    c.style.height = `${alto}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = COLOR.noche;
  }, []);

  useEffect(() => {
    preparar();
    window.addEventListener("resize", preparar);
    return () => window.removeEventListener("resize", preparar);
  }, [preparar]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = punto(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    dibujando.current = true;
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = punto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!conTrazo) setConTrazo(true);
  };

  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    const c = ref.current;
    if (c) onChange(c.toDataURL("image/png"));
  };

  const borrar = () => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setConTrazo(false);
    onChange(null);
  };

  return (
    <div>
      <div
        className="rounded border bg-white"
        style={{ borderColor: COLOR.piedra }}
      >
        <canvas
          ref={ref}
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
          onPointerCancel={terminar}
          className="block w-full touch-none"
          style={{ cursor: disabled ? "not-allowed" : "crosshair" }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs" style={{ color: COLOR.castano }}>
        <span>{conTrazo ? "Si no te gusta cómo quedó, borrala y volvé a firmar." : "Dibujá tu firma con el dedo o con el mouse."}</span>
        <button
          type="button"
          onClick={borrar}
          disabled={disabled || !conTrazo}
          className="underline disabled:opacity-40"
        >
          Borrar
        </button>
      </div>
    </div>
  );
}
