"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, Menu, Sparkles, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileMenu } from "@/components/layout/mobile-menu";
import type { NavCamino } from "@/lib/data/nav-caminos";

const PESTANAS: { href: string; label: string; icon: LucideIcon; activa: (p: string) => boolean }[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard, activa: (p) => p === "/" || p.startsWith("/dashboard") },
  { href: "/caminos", label: "Caminos", icon: Map, activa: (p) => p.startsWith("/caminos") },
  { href: "/peregrinos", label: "Peregrinos", icon: Users, activa: (p) => p.startsWith("/peregrinos") },
  { href: "/asistente", label: "Asistente", icon: Sparkles, activa: (p) => p.startsWith("/asistente") },
];

/**
 * La barra de pestañas de abajo, como en cualquier app del iPhone: lo que más se usa a un
 * toque del pulgar, y "Más" abre el menú completo. Solo en pantallas angostas.
 */
export function BarraInferior({ role, caminos, nombre }: { role: string; caminos: NavCamino[]; nombre: string }) {
  const pathname = usePathname();
  const item = "flex-1 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-medium";

  return (
    <nav
      className="app-nav md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación principal"
    >
      <div className="flex">
        {PESTANAS.map((t) => {
          const on = t.activa(pathname);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(item, on ? "text-ocre-profundo" : "text-castano")}
            >
              <Icon className={cn("h-[22px] w-[22px]", on && "stroke-[2.25]")} />
              {t.label}
            </Link>
          );
        })}
        <MobileMenu
          role={role}
          caminos={caminos}
          nombre={nombre}
          trigger={
            <button className={cn(item, "text-castano")} aria-label="Más opciones">
              <Menu className="h-[22px] w-[22px]" />
              Más
            </button>
          }
        />
      </div>
    </nav>
  );
}
