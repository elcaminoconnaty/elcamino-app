import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { BarraInferior } from "@/components/layout/barra-inferior";
import { BotonVolver } from "@/components/layout/boton-volver";
import type { Viewport } from "next";
import { TrmProvider } from "@/components/ui/eur-cop";
import { navCaminos } from "@/lib/data/nav-caminos";
import { Suspense } from "react";

// Adentro de la plataforma la página llega hasta los bordes del iPhone (muesca y barra de
// inicio) y cada barra fija se aparta con env(safe-area-inset-*). Las páginas públicas del
// peregrino no lo llevan: ahí no hay barras fijas que acomodar.
export const viewport: Viewport = {
  themeColor: "#3D5A6E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const publicClient = createPublicClient();
  const { data: { user } } = await publicClient.auth.getUser();
  if (!user) redirect("/login");

  const supabase = createClient();
  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    const { data: created } = await supabase
      .from("profiles")
      .insert({ id: user.id, email: user.email })
      .select()
      .maybeSingle();
    profile = created;
  }

  const role = profile?.app_role ?? "nico";
  const displayName = profile?.full_name ?? user.email ?? "Usuario";

  // La tasa global y los caminos con sus peregrinos (para los desplegables del menú).
  const [{ data: latestTrm }, caminos] = await Promise.all([
    supabase.from("trm_rates").select("eur_cop").order("date", { ascending: false }).limit(1).maybeSingle(),
    navCaminos(supabase),
  ]);
  const globalTrm = Number(latestTrm?.eur_cop ?? 0);

  return (
    <TrmProvider defaultTrm={globalTrm}>
    <div className="min-h-screen flex bg-alba">
      <Sidebar role={role} caminos={caminos} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* En el celular la cabecera es atlántico de borde a borde y se mete bajo la barra de
            estado (instalada como app la barra es transparente); en el computador sigue clara. */}
        <header className="sticky top-0 z-30 border-b bg-atlantico text-alba md:bg-background md:text-foreground pt-[env(safe-area-inset-top)]">
          <div className="h-14 flex items-center justify-between px-3 md:px-6">
            <div className="flex items-center gap-1 md:gap-3 min-w-0">
              <Suspense fallback={null}>
                <BotonVolver />
              </Suspense>
              <Link href="/" className="font-display text-lg text-alba md:text-noche truncate">
                El Camino con Naty
              </Link>
              <div className="brand-yellow-bar hidden md:block" />
            </div>
            <div className="hidden md:block">
              <UserMenu name={displayName} email={profile?.cedula ? "" : (user.email ?? "")} role={role} />
            </div>
            <div
              className="md:hidden h-8 w-8 shrink-0 rounded-full border border-ocre-claro/70 flex items-center justify-center text-xs font-medium text-ocre-claro"
              title={displayName}
            >
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">{children}</main>
      </div>
      <Suspense fallback={null}>
        <BarraInferior role={role} caminos={caminos} nombre={displayName} />
      </Suspense>
    </div>
    </TrmProvider>
  );
}
