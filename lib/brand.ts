/**
 * El ADN de marca de El Camino con Naty, en un solo sitio.
 *
 * Sale del brandbook fundacional 2026 (`Pagina Web el Camino con Naty/elcamino_brandbook_v2.pdf`),
 * que hasta ahora no lo usaba nadie: la web iba por su lado, el documento de viaje por otro
 * y los PDFs de la plataforma por un tercero. De acá beben los PDFs, los correos y las
 * páginas públicas, para que no vuelva a haber tres marcas conviviendo.
 *
 * Regla: ningún hex suelto en el resto del código. Si hace falta un color que no está acá,
 * la conversación es sobre el brandbook, no sobre el archivo que lo necesita.
 */

/**
 * Los siete colores del brandbook, con el nombre que les puso la marca.
 * El nombre importa: `atlantico` dice dónde va; `#3D5A6E` no dice nada.
 */
export const COLOR = {
  /** Fondo principal. El papel del diario de viaje, el amanecer antes de salir. */
  alba: "#F5EEE3",
  /** Secciones alternas y citas. */
  piedra: "#E8D9C0",
  /**
   * PRIMARIO. La flecha amarilla que guía al peregrino.
   * Solo gráfico: filetes, iconos, marcas. **Nunca lleva texto sobre claro** — sobre alba
   * da 2,77:1. Para texto y botones está `ocreProfundo`.
   */
  ocre: "#C4822A",
  /**
   * El ocre cuando tiene que leerse sobre claro: botones, enlaces y rótulos sobre alba
   * (4,52:1). También sobre piedra, donde da 3,75:1 — válido de 16 px en adelante.
   */
  ocreProfundo: "#946220",
  /**
   * El ocre cuando tiene que leerse sobre oscuro. Sobre atlántico el ocre original solo da
   * 2,28:1, así que los rótulos de las cabeceras van con este (4,50:1). Sobre noche da 8,65:1.
   */
  ocreClaro: "#E9C697",
  /** Texto secundario sobre claro, de 16 px hacia arriba (4,31:1). */
  castano: "#8B6A3E",
  /** Secciones que evocan el paisaje: cards de experiencia, elementos del Camino. */
  musgo: "#4A5E47",
  /**
   * Filetes, separadores y estados inactivos. NUNCA como color de acción.
   * **Corrección sobre la edición 2026**, que lo daba para texto secundario: sobre alba da
   * 2,47:1 y no se lee. Como texto solo sobre noche (4,92:1); sobre claro, castaño.
   */
  niebla: "#8B9E8F",
  /** SECUNDARIO. La profundidad, el océano al final del Camino. Cabeceras, pies, impacto. */
  atlantico: "#3D5A6E",
  /** Fondo profundo y versión negativa del logo. */
  noche: "#1A2E3D",
} as const;

/**
 * Colores de estado. No están en el brandbook porque el brandbook no cubre software,
 * pero se derivan de su paleta para que un error no meta un rojo de bootstrap en medio
 * de la papelería.
 */
export const ESTADO = {
  ok: COLOR.musgo,
  alerta: COLOR.ocreProfundo,
  error: "#9B3D3D", // castaño llevado al rojo, misma familia cálida
} as const;

/**
 * Las tres voces tipográficas. El brandbook las llama "lo sagrado, lo poético y lo cotidiano".
 *
 * OJO: en correo no existen los webfonts (Outlook pinta con el motor de Word), así que la
 * papelería de correo usa `FUENTE_CORREO` y no esto.
 */
export const FUENTE = {
  /** Títulos principales, navegación, rótulos institucionales, numeración. */
  display: "Cinzel",
  /** Subtítulos emocionales, citas, textos poéticos, taglines. */
  serif: "Cormorant Garamond",
  /** Cuerpo de texto, UI, botones, etiquetas y metadatos. */
  body: "DM Sans",
} as const;

/**
 * Escaleras de respaldo para correo, donde solo se puede contar con fuentes del sistema.
 * Georgia hace de Cinzel y de Cormorant: es la serif que más se le parece y está en todas
 * partes. No es un atajo — es la única forma de que el correo se vea igual en Gmail, en
 * Outlook y en Apple Mail sin cargar nada remoto.
 */
export const FUENTE_CORREO = {
  display: "Georgia, 'Times New Roman', Times, serif",
  body: "Arial, Helvetica, sans-serif",
} as const;

/**
 * Escala tipográfica del brandbook, en px para pantalla.
 * Los PDFs usan `ESCALA_PDF`, que va en puntos y es más apretada: una hoja A4 no es un hero.
 */
export const ESCALA = {
  h1: 56,
  h2: 36,
  h3: 28,
  lead: 19,
  body: 17,
  caption: 13,
} as const;

/** La misma escala llevada a puntos de PDF. */
export const ESCALA_PDF = {
  portada: 34,
  h1: 20,
  h2: 14,
  h3: 11,
  body: 9.5,
  caption: 8,
  micro: 7,
} as const;

/**
 * Reglas del logo, tal como las fija el brandbook. Se dejan como datos y no como comentario
 * para que el código que dibuja el logo pueda comprobarlas.
 */
export const LOGO = {
  /** Zona de respeto: la altura completa de la concha, en los cuatro lados. Nunca comprimir. */
  zonaDeRespeto: "alto-de-la-concha",
  minimo: { digitalPx: 160, impresoMm: 42, iconoDigitalPx: 24, iconoImpresoMm: 6 },
  versiones: ["positivo-en-claro", "negativo-en-oscuro", "mono-atlantico", "mono-blanco"] as const,
  /** No distorsionar, no poner sobre foto sin overlay, no recolorear, sin degradados ni sombras. */
  prohibido: ["distorsionar", "sobre-foto-sin-overlay", "recolorear", "degradado", "sombra"] as const,
} as const;

/** Iconografía: línea fina abierta, "el camino que aún no se ha terminado de recorrer". */
export const ICONO = { grosor: 1.35, relleno: "none" } as const;

/**
 * Overlay obligatorio cuando va texto o logo sobre una fotografía. El brandbook lo exige
 * y es también lo que hace legible la portada del documento de viaje al sol.
 */
export const OVERLAY_FOTO = "rgba(26, 46, 61, 0.55)"; // noche al 55%

/** Datos de contacto que aparecen en la papelería. Uno solo, para que no se desincronicen. */
export const CONTACTO = {
  marca: "El Camino con Naty",
  sitio: "elcaminoconnaty.com",
  correo: "elcaminoconnaty@gmail.com",
  whatsapp: "+57 301 431 4296",
  whatsappE164: "+573014314296",
  mantra: "Caminamos para des-cubrirnos.",
} as const;

/**
 * Combinaciones que el brandbook da por buenas. Tenerlas nombradas evita que cada pantalla
 * invente la suya.
 */
export const COMBINACION = {
  /** Hero, cabeceras, secciones de impacto. La tríada base. */
  principal: { fondo: COLOR.atlantico, texto: COLOR.alba, acento: COLOR.ocre },
  /** Cuerpo de página, blog, testimonios. El acento lleva texto, así que va profundo. */
  clara: { fondo: COLOR.alba, texto: COLOR.atlantico, acento: COLOR.ocreProfundo },
  /** Cards de experiencias y elementos de ruta. */
  naturaleza: { fondo: COLOR.musgo, texto: COLOR.alba, acento: COLOR.piedra },
} as const;

export type NombreColor = keyof typeof COLOR;
