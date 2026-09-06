"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Cuando llega del email link, Supabase setea la sesión automáticamente.
    // Esperamos a que esté lista.
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      toast({ title: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "La contraseña debe tener al menos 8 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "No pude guardar la contraseña", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Contraseña guardada", description: "Ya podés entrar.", variant: "success" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-alba px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-ocre bg-piedra-suave">
            <span className="font-display text-2xl text-noche">EC</span>
          </div>
          <h1 className="font-display text-3xl text-noche">El Camino con Naty</h1>
          <div className="brand-yellow-bar mx-auto mt-3" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Definir contraseña</CardTitle>
            <CardDescription>Elegí una contraseña de al menos 8 caracteres.</CardDescription>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <div className="text-sm text-muted-foreground">Validando el enlace...</div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Nueva contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Repetir contraseña</Label>
                  <Input
                    id="password2"
                    type="password"
                    required
                    minLength={8}
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" variant="accent" className="w-full" disabled={loading || !password || !password2}>
                  {loading ? "Guardando..." : "Guardar contraseña"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
