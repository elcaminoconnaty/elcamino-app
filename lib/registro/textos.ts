/**
 * Los textos del formulario de inscripción. Vienen del Google Form que se usaba antes
 * ("Registro Camino Francés 09.26"), con la voz de la marca.
 */
export const REGISTRO = {
  bienvenida: [
    "Si estás leyendo esto, es porque ya eres parte de este Camino. 💛",
    "Juntos peregrinaremos a la conquista de tu versión más auténtica y libre. Nuestra alma te saluda y te da la bienvenida a esta experiencia que dejará huellas en ti.",
    "Estamos felices de que seas parte de la familia de peregrinos.",
    "Para continuar con el proceso, necesitamos estos datos:",
  ],
  pasaporte: "Uso exclusivo para las reservas de hoteles y transporte. Se borra cuando termina el camino.",
  apodo: "Nos encantaría saber si tienes alguna forma especial en que te guste que nos refiramos a ti.",
  contacto: "Es importante que esta persona responda oportunamente por WhatsApp: será el medio por el que la contactaremos en caso de ser necesario.",
  sandalias: "Mide tu pie y confírmala con la guía de tallas.",
  /**
   * La foto de la guía de tallas del proveedor de las sandalias, si la hay (ruta dentro de
   * `public/`, p. ej. "/registro/guia-tallas.jpg"). Mientras no esté, el formulario muestra
   * la tabla de `GUIA_SANDALIAS`, que es la equivalencia europea estándar.
   */
  guiaSandaliasImagen: null as string | null,
  alimentacion: "Restricción, no preferencia. No garantizamos poder cumplir con todo, pero lo tendremos en cuenta y haremos lo posible.",
  gracias: "¡Listo! Ya tenemos tus datos. Cualquier cambio, vuelve a este mismo enlace y los corriges.",
} as const;

export const TALLAS_CAMISETA = ["XS", "S", "M", "L", "XL"] as const;
export const TALLAS_SANDALIA = [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45] as const;

/**
 * Talla europea → largo del pie en centímetros (talón a la punta del dedo más largo) y su
 * equivalente en EE. UU. Es la tabla estándar; cada marca se corre medio número, por eso el
 * formulario aconseja la talla de arriba cuando se está entre dos.
 */
export const GUIA_SANDALIAS: ReadonlyArray<{ eu: number; cm: string; usMujer: string; usHombre: string }> = [
  { eu: 35, cm: "22,0 – 22,5", usMujer: "5", usHombre: "—" },
  { eu: 36, cm: "22,5 – 23,0", usMujer: "5,5 – 6", usHombre: "—" },
  { eu: 37, cm: "23,5 – 24,0", usMujer: "6,5", usHombre: "—" },
  { eu: 38, cm: "24,0 – 24,5", usMujer: "7 – 7,5", usHombre: "6" },
  { eu: 39, cm: "24,5 – 25,0", usMujer: "8", usHombre: "6,5" },
  { eu: 40, cm: "25,0 – 25,5", usMujer: "8,5 – 9", usHombre: "7" },
  { eu: 41, cm: "26,0 – 26,5", usMujer: "9,5 – 10", usHombre: "8" },
  { eu: 42, cm: "26,5 – 27,0", usMujer: "10,5", usHombre: "8,5 – 9" },
  { eu: 43, cm: "27,5 – 28,0", usMujer: "—", usHombre: "9,5 – 10" },
  { eu: 44, cm: "28,0 – 28,5", usMujer: "—", usHombre: "10,5" },
  { eu: 45, cm: "29,0 – 29,5", usMujer: "—", usHombre: "11 – 11,5" },
];

export const COMO_MEDIR_PIE = [
  "Pon una hoja en el piso, contra la pared, y apoya el talón en la pared.",
  "Marca con un lápiz la punta del dedo más largo y mide en centímetros.",
  "Mide los dos pies al final del día (se hinchan) y quédate con el más largo.",
  "Si quedas entre dos tallas, elige la más grande: en el Camino el pie se hincha.",
] as const;

/** Indicativos más comunes entre quienes viajan con nosotros. */
export const INDICATIVOS = [
  { code: "+57", label: "Colombia +57" },
  { code: "+34", label: "España +34" },
  { code: "+1", label: "EE. UU. / Canadá +1" },
  { code: "+52", label: "México +52" },
  { code: "+51", label: "Perú +51" },
  { code: "+56", label: "Chile +56" },
  { code: "+54", label: "Argentina +54" },
  { code: "+593", label: "Ecuador +593" },
  { code: "+507", label: "Panamá +507" },
  { code: "+506", label: "Costa Rica +506" },
  { code: "+58", label: "Venezuela +58" },
  { code: "+55", label: "Brasil +55" },
  { code: "+44", label: "Reino Unido +44" },
] as const;
