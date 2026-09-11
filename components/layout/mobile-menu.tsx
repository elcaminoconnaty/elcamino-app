"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { NavTree } from "@/components/layout/nav-tree";
import type { NavCamino } from "@/lib/data/nav-caminos";

export function MobileMenu({ role, caminos }: { role: string; caminos: NavCamino[] }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Se cierra al navegar, incluso si solo cambió la pestaña o el camino en la URL.
  const ruta = `${pathname}?${searchParams.toString()}`;
  React.useEffect(() => setOpen(false), [ruta]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          aria-label="Abrir menú"
          className="md:hidden h-10 w-10 rounded-md hover:bg-piedra-suave flex items-center justify-center"
        >
          <Menu className="h-5 w-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-background border-r shadow-xl flex flex-col md:hidden focus:outline-none">
          <Dialog.Title className="sr-only">Menú principal</Dialog.Title>
          <div className="px-5 py-4 flex items-center justify-between border-b">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full border-2 border-ocre bg-piedra-suave flex items-center justify-center">
                <span className="font-display text-sm text-noche">EC</span>
              </div>
              <div>
                <div className="text-sm font-display text-noche leading-tight">El Camino</div>
                <div className="text-xs text-muted-foreground leading-tight">con Naty</div>
              </div>
            </Link>
            <Dialog.Close className="h-8 w-8 rounded-md hover:bg-piedra-suave flex items-center justify-center">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <nav className="flex-1 p-3 overflow-y-auto">
            <NavTree caminos={caminos} compact />
          </nav>
          <div className="px-5 py-4 border-t">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Rol</div>
            <div className="text-sm capitalize">{role}</div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
