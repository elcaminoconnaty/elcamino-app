"use client";

import { useRef, useState } from "react";
import { Play, RotateCcw, Download } from "lucide-react";
import { COLOR } from "@/lib/brand";

/**
 * El reproductor de la página /video/<token>. Antes del primer play muestra una portada con
 * la marca (no un fotograma: el video es sorpresa); al terminar, una despedida con la
 * opción de verlo otra vez. En medio, los controles nativos, que en el celular ya saben
 * pantalla completa, AirPlay y volumen mejor que cualquier cosa hecha a mano.
 */
export function ReproductorVideo({ token, src, ancho, alto, minutos, nombre, contar = true }: { token: string; src: string; ancho: number; alto: number; minutos: number; nombre: string; /** El equipo revisa con ?vista=equipo y no suma. */ contar?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [fase, setFase] = useState<"portada" | "viendo" | "fin">("portada");
  const [error, setError] = useState(false);
  const contada = useRef(false);

  function reproducir() {
    const el = video.current;
    if (!el) return;
    if (fase === "fin") el.currentTime = 0;
    setFase("viendo");
    el.play().catch(() => {});
    if (contar && !contada.current) {
      contada.current = true;
      fetch(`/video/${token}/visto`, { method: "POST", keepalive: true }).catch(() => {});
    }
  }

  const proporcion = ancho / alto;
  const boton: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "11px 20px", fontSize: 15, textDecoration: "none", cursor: "pointer" };

  return (
    <>
      <div
        style={{
          position: "relative",
          width: `min(100%, calc(74svh * ${proporcion}))`,
          aspectRatio: `${ancho} / ${alto}`,
          borderRadius: 18,
          overflow: "hidden",
          background: "#000",
          boxShadow: `0 0 0 1px ${COLOR.ocre}55, 0 24px 60px rgba(0,0,0,.45)`,
        }}
      >
        <video
          ref={video}
          src={src}
          playsInline
          preload="metadata"
          controls={fase === "viendo"}
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          onEnded={() => setFase("fin")}
          onError={() => setError(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />

        {fase !== "viendo" && (
          <button
            type="button"
            onClick={reproducir}
            aria-label={fase === "fin" ? "Ver el video otra vez" : "Ver el video"}
            style={{ position: "absolute", inset: 0, border: 0, padding: 24, cursor: "pointer", color: COLOR.alba, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}
          >
            <img src="/bienvenida/cierre.jpg" alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <span aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(26, 46, 61, 0.62)" }} />
            {fase === "portada" ? (
              <>
                <span className="video-latido" style={{ position: "relative", width: 84, height: 84, borderRadius: "50%", background: COLOR.ocre, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Play fill={COLOR.noche} color={COLOR.noche} size={34} style={{ marginLeft: 5 }} />
                </span>
                <span className="font-display" style={{ position: "relative", fontSize: 24, fontStyle: "italic" }}>Toca para verlo</span>
                <span style={{ position: "relative", fontSize: 13, color: COLOR.piedra, lineHeight: 1.5, maxWidth: 240 }}>
                  {minutos} min · Busca un momento tranquilo y sube el volumen
                </span>
              </>
            ) : (
              <>
                <span className="font-display" style={{ position: "relative", fontSize: 30, fontStyle: "italic", lineHeight: 1.15 }}>Buen camino, {nombre}</span>
                <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: COLOR.ocreClaro }}>
                  <RotateCcw size={16} /> Verlo otra vez
                </span>
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 14, color: COLOR.ocreClaro, marginTop: 14 }}>
          El video no cargó. Revisa tu conexión y{" "}
          <a href="" style={{ color: COLOR.alba, textDecoration: "underline" }}>recarga la página</a>.
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <a href={`/video/${token}/descargar`} style={{ ...boton, border: `1px solid ${COLOR.ocreClaro}88`, color: COLOR.alba }}>
          <Download size={17} /> Guardar mi video
        </a>
      </div>

      <style>{`
        .video-latido { animation: latido 2.4s ease-in-out infinite; box-shadow: 0 0 0 0 ${COLOR.ocre}88; }
        @keyframes latido { 0%,100% { box-shadow: 0 0 0 0 ${COLOR.ocre}77; } 60% { box-shadow: 0 0 0 18px ${COLOR.ocre}00; } }
        @media (prefers-reduced-motion: reduce) { .video-latido { animation: none; } }
      `}</style>
    </>
  );
}
