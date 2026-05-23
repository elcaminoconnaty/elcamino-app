"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="flex items-center gap-2 md:gap-3">
      <div className="text-right hidden sm:block">
        <div className="text-sm font-medium leading-tight">{name}</div>
        <div className="text-xs text-muted-foreground leading-tight">{email} · {role}</div>
      </div>
      <Button variant="ghost" size="icon" onClick={signOut} title="Salir">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
