"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Map,
  Users,
  Receipt,
  Building2,
  Wallet,
  TrendingUp,
  Settings,
} from "lucide-react";

const items = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/caminos", label: "Caminos", icon: Map },
  { href: "/peregrinos", label: "Peregrinos", icon: Users },
  { href: "/proveedores", label: "Proveedores", icon: Building2 },
  { href: "/gastos", label: "Gastos", icon: Wallet },
  { href: "/trm", label: "TRM", icon: TrendingUp },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export default function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r bg-background">
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full border-2 border-camino-yellow bg-cream-100 flex items-center justify-center">
            <span className="font-display text-camino-ink">EC</span>
          </div>
          <div>
            <div className="text-sm font-display text-camino-ink leading-tight">El Camino</div>
            <div className="text-xs text-muted-foreground leading-tight">con Naty</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-camino-yellow/20 text-camino-ink font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-cream-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Rol</div>
        <div className="text-sm capitalize">{role}</div>
      </div>
    </aside>
  );
}
