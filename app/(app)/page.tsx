import { redirect } from "next/navigation";
import { createClient, createPublicClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createClient();
  const publicClient = createPublicClient();
  const { data: { user } } = await publicClient.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.app_role === "naty") redirect("/dashboard/naty");
  redirect("/dashboard/nico");
}
