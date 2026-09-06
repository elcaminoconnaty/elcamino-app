import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");

  // Rutas que un peregrino abre sin tener cuenta: el enlace de firma, la comprobación de
  // integridad de un documento firmado, la ficha pública del viaje y la versión web de un
  // correo. Todas se protegen por un token largo, no por sesión, y `next.config.mjs` les
  // pone Referrer-Policy: no-referrer y X-Robots-Tag: noindex.
  const esPublica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (esPublica) return response;

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * Ver el comentario dentro de `middleware`.
 *
 * `/api/pdf/contrato/publico` va acá porque la página de firma muestra el contrato en un
 * iframe: si la ruta del PDF pide sesión, el peregrino ve el recuadro vacío y no puede leer
 * lo que está a punto de firmar. Se autentica con el mismo token que la página.
 */
const PUBLICAS = ["/firmar", "/verificar", "/viaje", "/correo", "/api/pdf/contrato/publico"];

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
