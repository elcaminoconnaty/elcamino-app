"use client";
import * as React from "react";
import Link from "next/link";
import { NavTree } from "@/components/layout/nav-tree";
import type { NavCamino } from "@/lib/data/nav-caminos";

export default function Sidebar({ role, caminos }: { role: string; caminos: NavCamino[] }) {
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r bg-background md:sticky md:top-0 md:h-screen">
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full border-2 border-ocre bg-piedra-suave flex items-center justify-center">
            <span className="font-display text-noche">EC</span>
          </div>
          <div>
            <div className="text-sm font-display text-noche leading-tight">El Camino</div>
            <div className="text-xs text-muted-foreground leading-tight">con Naty</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-3 overflow-y-auto pb-3">
        <React.Suspense fallback={null}>
          <NavTree caminos={caminos} />
        </React.Suspense>
      </nav>
      <div className="px-5 py-4 border-t">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Rol</div>
        <div className="text-sm capitalize">{role}</div>
      </div>
    </aside>
  );
}
