"use client";
import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";

type ToastMsg = { id: number; title: string; description?: string; variant?: "default" | "destructive" | "success" };

const ToastContext = React.createContext<{ toast: (m: Omit<ToastMsg, "id">) => void } | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return { toast: (_: Omit<ToastMsg, "id">) => {} };
  return ctx;
}

export function Toaster() {
  const [msgs, setMsgs] = React.useState<ToastMsg[]>([]);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Omit<ToastMsg, "id">;
      setMsgs((prev) => [...prev, { id: Date.now() + Math.random(), ...detail }]);
    };
    window.addEventListener("app-toast", handler);
    return () => window.removeEventListener("app-toast", handler);
  }, []);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
      {msgs.map((m) => (
        <ToastPrimitive.Root
          key={m.id}
          onOpenChange={(open) => !open && setMsgs((prev) => prev.filter((x) => x.id !== m.id))}
          className={cn(
            "group pointer-events-auto relative flex w-full items-start justify-between gap-2 overflow-hidden rounded-md border p-4 shadow-lg",
            m.variant === "destructive" && "bg-destructive text-destructive-foreground border-destructive",
            m.variant === "success" && "bg-green-50 border-green-200 text-green-900",
            (!m.variant || m.variant === "default") && "bg-background"
          )}
        >
          <div className="flex-1">
            <ToastPrimitive.Title className="text-sm font-semibold">{m.title}</ToastPrimitive.Title>
            {m.description && <ToastPrimitive.Description className="text-sm opacity-90 mt-1">{m.description}</ToastPrimitive.Description>}
          </div>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[400px] gap-2" />
    </ToastPrimitive.Provider>
  );
}

export function toast(m: Omit<ToastMsg, "id">) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app-toast", { detail: m }));
}
