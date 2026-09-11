"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Map,
  Users,
  Building2,
  Wallet,
  TrendingUp,
  Settings,
  CalendarClock,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavCamino } from "@/lib/data/nav-caminos";
import { rutaCamino, rutaPeregrino, rutaPeregrinosDeCamino } from "@/lib/rutas";

type Item = { href: string; label: string; icon: LucideIcon; tree?: "caminos" | "peregrinos" };

const items: Item[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/caminos", label: "Caminos", icon: Map, tree: "caminos" },
  { href: "/peregrinos", label: "Peregrinos", icon: Users, tree: "peregrinos" },
  { href: "/pagos", label: "Pagos", icon: CalendarClock },
  { href: "/proveedores", label: "Proveedores", icon: Building2 },
  { href: "/gastos", label: "Gastos", icon: Wallet },
  { href: "/trm", label: "TRM", icon: TrendingUp },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

/**
 * Menú principal compartido por la barra lateral y el menú móvil.
 *
 * "Caminos" despliega la lista de caminos; "Peregrinos" despliega los caminos y, dentro
 * de cada uno, sus peregrinos. Las secciones se abren solas según la página en la que
 * estés (p. ej. en la ficha de un peregrino se abre el camino desde el que llegaste) y
 * con la flechita se pueden abrir o cerrar a mano.
 */
export function NavTree({ caminos, compact = false }: { caminos: NavCamino[]; compact?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const caminoParam = searchParams.get("camino");

  // Qué debería estar abierto según la ruta actual.
  const auto = React.useMemo(() => {
    const abiertos = new Set<string>();
    const caminoActual = pathname.match(/^\/caminos\/([^/]+)/)?.[1] ?? null;
    const peregrinoActual = pathname.match(/^\/peregrinos\/([^/]+)/)?.[1] ?? null;

    if (pathname.startsWith("/caminos")) abiertos.add("caminos");
    if (pathname.startsWith("/peregrinos")) abiertos.add("peregrinos");

    if (caminoActual && tab === "peregrinos") {
      abiertos.add("peregrinos");
      abiertos.add(`peregrinos:${caminoActual}`);
    }
    if (peregrinoActual) {
      if (caminoParam) abiertos.add(`peregrinos:${caminoParam}`);
      else for (const c of caminos) if (c.peregrinos.some((p) => p.id === peregrinoActual)) abiertos.add(`peregrinos:${c.id}`);
    }
    return abiertos;
  }, [pathname, tab, caminoParam, caminos]);

  // Lo que el usuario abrió/cerró a mano manda sobre lo automático, hasta la próxima navegación.
  const [manual, setManual] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => setManual({}), [pathname, tab, caminoParam]);
  const abierto = (key: string) => manual[key] ?? auto.has(key);
  const alternar = (key: string) => setManual((m) => ({ ...m, [key]: !abierto(key) }));

  const caminoActual = pathname.match(/^\/caminos\/([^/]+)/)?.[1] ?? null;
  const peregrinoActual = pathname.match(/^\/peregrinos\/([^/]+)/)?.[1] ?? null;

  const py = compact ? "py-2.5" : "py-2";

  return (
    <div className="space-y-1">
      {items.map((it) => {
        const Icon = it.icon;
        const active = pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href));
        const conArbol = !!it.tree && caminos.length > 0;
        return (
          <div key={it.href}>
            <Fila
              href={it.href}
              active={active}
              className={cn("px-3 text-sm", py)}
              abierto={conArbol ? abierto(it.tree!) : undefined}
              onAlternar={conArbol ? () => alternar(it.tree!) : undefined}
              titulo={conArbol ? (abierto(it.tree!) ? `Ocultar ${it.label.toLowerCase()}` : `Ver ${it.label.toLowerCase()}`) : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{it.label}</span>
            </Fila>

            {conArbol && abierto(it.tree!) && (
              <div className="mt-0.5 ml-4 pl-3 border-l border-piedra-suave space-y-0.5">
                {caminos.map((c) => {
                  if (it.tree === "caminos") {
                    return (
                      <Fila
                        key={c.id}
                        href={rutaCamino(c.id)}
                        active={caminoActual === c.id}
                        className={cn("px-2 text-[13px]", compact ? "py-2" : "py-1.5")}
                      >
                        <span className="truncate">{c.name}</span>
                        <Contador n={c.peregrinos.length} />
                      </Fila>
                    );
                  }
                  const key = `peregrinos:${c.id}`;
                  const activo =
                    (caminoActual === c.id && tab === "peregrinos") || (!!peregrinoActual && caminoParam === c.id);
                  return (
                    <div key={c.id}>
                      <Fila
                        href={rutaPeregrinosDeCamino(c.id)}
                        active={activo}
                        className={cn("px-2 text-[13px]", compact ? "py-2" : "py-1.5")}
                        abierto={c.peregrinos.length > 0 ? abierto(key) : undefined}
                        onAlternar={c.peregrinos.length > 0 ? () => alternar(key) : undefined}
                        titulo={abierto(key) ? "Ocultar peregrinos" : "Ver peregrinos"}
                      >
                        <span className="truncate">{c.name}</span>
                        <Contador n={c.peregrinos.length} />
                      </Fila>
                      {abierto(key) && c.peregrinos.length > 0 && (
                        <div className="ml-2 pl-3 border-l border-piedra-suave space-y-0.5 mt-0.5">
                          {c.peregrinos.map((p) => (
                            <Fila
                              key={p.id}
                              href={rutaPeregrino(p.id, c.id)}
                              active={peregrinoActual === p.id}
                              className={cn("px-2 text-xs", compact ? "py-1.5" : "py-1")}
                            >
                              <span className="truncate">{p.full_name}</span>
                            </Fila>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Contador({ n }: { n: number }) {
  return <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/80 shrink-0">{n}</span>;
}

/** Un renglón del menú: el enlace navega y la flechita (si hay) solo abre o cierra. */
function Fila({
  href,
  active,
  className,
  abierto,
  onAlternar,
  titulo,
  children,
}: {
  href: string;
  active: boolean;
  className?: string;
  abierto?: boolean;
  onAlternar?: () => void;
  titulo?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-md transition-colors",
        active ? "bg-ocre/20 text-noche font-medium" : "text-muted-foreground hover:text-foreground hover:bg-piedra-suave"
      )}
    >
      <Link href={href} className={cn("flex-1 min-w-0 flex items-center gap-2.5", className)}>
        {children}
      </Link>
      {onAlternar && (
        <button
          type="button"
          aria-label={titulo}
          title={titulo}
          aria-expanded={abierto}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAlternar();
          }}
          className="h-7 w-7 mr-1 shrink-0 rounded flex items-center justify-center hover:bg-ocre/30"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", abierto && "rotate-90")} />
        </button>
      )}
    </div>
  );
}
