"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { LogOut, X } from "lucide-react";
import { NavTree } from "@/components/layout/nav-tree";
import { createClient } from "@/lib/supabase/client";
import type { NavCamino } from "@/lib/data/nav-caminos";

/**
 * El menú completo en el celular. Se abre desde "Más" en la barra de abajo (`trigger`).
 * Abajo lleva quién está adentro y el botón de salir: en el celular no van en la cabecera,
 * donde un toque sin querer cerraba la sesión.
 */
export function MobileMenu({
  role,
  caminos,
  nombre,
  trigger,
}: {
  role: string;
  caminos: NavCamino[];
  nombre: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Se cierra al navegar, incluso si solo cambió la pestaña o el camino en la URL.
  const ruta = `${pathname}?${searchParams.toString()}`;
  React.useEffect(() => setOpen(false), [ruta]);

  async function salir() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden" />
        <Dialog.Content className="app-nav fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-background border-r shadow-xl flex flex-col md:hidden focus:outline-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <Dialog.Title className="sr-only">Menú principal</Dialog.Title>
          <div className="px-5 py-4 flex items-center justify-between border-b">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full border-2 border-ocre bg-piedra-suave flex items-center justify-center">
                <span className="font-display text-xs tracking-wide text-noche">ECN</span>
              </div>
              <div>
                <div className="text-sm font-display text-noche leading-tight">El Camino</div>
                <div className="text-xs text-muted-foreground leading-tight">con Naty</div>
              </div>
            </Link>
            <Dialog.Close className="h-10 w-10 rounded-md hover:bg-piedra-suave flex items-center justify-center" aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <nav className="flex-1 p-3 overflow-y-auto">
            <NavTree caminos={caminos} compact />
          </nav>
          <div className="px-5 py-3 border-t flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{nombre}</div>
              <div className="text-xs text-muted-foreground capitalize">{role}</div>
            </div>
            <button onClick={salir} className="h-10 px-3 rounded-md hover:bg-piedra-suave flex items-center gap-2 text-sm text-atlantico">
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
