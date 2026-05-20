import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const publicClient = createPublicClient();
  const { data: { user } } = await publicClient.auth.getUser();
  if (!user) redirect("/login");

  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.app_role ?? "nico";
  const displayName = profile?.full_name ?? user.email ?? "Usuario";

  return (
    <div className="min-h-screen flex bg-cream-50">
      <Sidebar role={role} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-background/80 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-display text-lg text-camino-ink">
              El Camino con Naty
            </Link>
            <div className="brand-yellow-bar" />
          </div>
          <UserMenu name={displayName} email={user.email ?? ""} role={role} />
        </header>
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
