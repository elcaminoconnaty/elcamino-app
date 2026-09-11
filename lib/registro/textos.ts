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
  pasaporte: "Uso exclusivo para las reservas de hoteles y transporte. La foto se borra cuando termina el camino.",
  apodo: "Nos encantaría saber si tienes alguna forma especial en que te guste que nos refiramos a ti.",
  contacto: "Es importante que esta persona responda oportunamente por WhatsApp: será el medio por el que la contactaremos en caso de ser necesario.",
  sandalias: "Usa la guía de tallas para confirmar la tuya.",
  /** Si hay una guía de tallas publicada, va acá y el formulario la enlaza. */
  guiaSandaliasUrl: null as string | null,
  alimentacion: "Restricción, no preferencia. No garantizamos poder cumplir con todo, pero lo tendremos en cuenta y haremos lo posible.",
  gracias: "¡Listo! Ya tenemos tus datos. Cualquier cambio, vuelve a este mismo enlace y los corriges.",
} as const;

export const TALLAS_CAMISETA = ["XS", "S", "M", "L", "XL"] as const;
export const TALLAS_SANDALIA = [35, 36, 37, 38, 39, 40, 41, 42] as const;

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
