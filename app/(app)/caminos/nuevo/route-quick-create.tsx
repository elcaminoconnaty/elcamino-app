"use client";
// Crear ruta rápida desde el alta de camino.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createRoute } from "@/lib/actions/departures";
import { toast } from "@/components/ui/toaster";

export function RouteQuickCreate() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-xs h-7 self-start text-ocre-profundo">+ Nueva ruta</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva ruta</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            try {
              await createRoute(fd);
              toast({ title: "Ruta creada", variant: "success" });
              setOpen(false);
              window.location.reload();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
          }}
          className="space-y-3"
        >
          <div className="grid gap-2">
            <Label htmlFor="r-name">Nombre</Label>
            <Input id="r-name" name="name" required placeholder="Camino Francés" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="r-slug">Slug</Label>
            <Input id="r-slug" name="slug" required placeholder="camino-frances" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label htmlFor="r-days">Días</Label><Input id="r-days" name="days" type="number" /></div>
            <div className="grid gap-2"><Label htmlFor="r-nights">Noches</Label><Input id="r-nights" name="nights" type="number" /></div>
            <div className="grid gap-2"><Label htmlFor="r-km">Km</Label><Input id="r-km" name="km" type="number" step="0.1" /></div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="r-description">Descripción</Label>
            <Textarea id="r-description" name="description" rows={3} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="accent">Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
