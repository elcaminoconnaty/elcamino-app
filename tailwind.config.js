/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        /* ── La paleta del brandbook (edición 2027) ──────────────────────────
           Es la misma que `lib/brand.ts`, que es la que usan los PDFs y los
           correos. Si cambia una, cambia la otra: son la misma marca.       */
        alba: "#F5EEE3",        // fondo principal. Nunca blanco puro.
        piedra: "#E8D9C0",      // bloques y secciones alternas
        "piedra-suave": "#EFE5D6",
        ocre: "#C4822A",        // la flecha que guía. SOLO gráfico: filetes, iconos, fondos.
        "ocre-profundo": "#946220", // el ocre cuando lleva texto sobre claro (4,52:1)
        "ocre-claro": "#E9C697",    // el ocre cuando lleva texto sobre atlántico o noche
        castano: "#8B6A3E",     // texto secundario sobre claro, de 16px en adelante
        musgo: "#4A5E47",
        niebla: "#8B9E8F",      // filetes e inactivos. Como texto, solo sobre noche.
        atlantico: "#3D5A6E",   // cabeceras, pies y texto principal
        noche: "#1A2E3D",       // fondo profundo y dato duro

        /* ── Estado ──────────────────────────────────────────────────────────
           Derivados de la paleta, no de Tailwind: un rojo de framework en
           medio de esta papelería se ve prestado. Todos los 700 pasan AA
           sobre su propio 50 y sobre alba.                                   */
        aviso: { "50": "#FAF2E8", "100": "#F4E4D0", "200": "#E7CEAC", "300": "#D9B17D", "500": "#C3822A", "700": "#956320", "800": "#784F1A", "900": "#5E3F14" },
        ok: { "50": "#F0F3EF", "100": "#DFE5DE", "200": "#C5CFC3", "300": "#A4B4A1", "500": "#4A5E47", "700": "#3D4D3A", "800": "#313E2F", "900": "#263024" },
        error: { "50": "#F6EBEB", "100": "#EDD7D7", "200": "#DBB8B8", "300": "#C88E8E", "500": "#9A3C3C", "700": "#9A3C3C", "800": "#7C3131", "900": "#5F2525" },
        info: { "50": "#EDF2F5", "100": "#DAE3E9", "200": "#BDCCD6", "300": "#98AEBE", "500": "#3E5B70", "700": "#3E5B70", "800": "#2D4352", "900": "#202F39" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        /* Las tres voces del brandbook: lo cotidiano, lo poético y lo sagrado. */
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],       // DM Sans: cuerpo y UI
        display: ["var(--font-display)", "Georgia", "serif"],        // Cormorant: titulares y citas
        seal: ["var(--font-seal)", "Georgia", "serif"],              // Cinzel: solo sello, mayúsculas espaciadas
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
