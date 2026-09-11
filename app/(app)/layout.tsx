import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { TrmProvider } from "@/components/ui/eur-cop";
import { navCaminos } from "@/lib/data/nav-caminos";
import { Suspense } from "react";

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
        <header className="h-14 border-b bg-background/80 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-3 md:px-6">
          <div className="flex items-center gap-2 md:gap-3">
            <Suspense fallback={null}>
              <MobileMenu role={role} caminos={caminos} />
            </Suspense>
            <Link href="/" className="font-display text-base md:text-lg text-noche">
              El Camino con Naty
            </Link>
            <div className="brand-yellow-bar hidden sm:block" />
          </div>
          <UserMenu name={displayName} email={user.email ?? ""} role={role} />
        </header>
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
    </TrmProvider>
  );
}
