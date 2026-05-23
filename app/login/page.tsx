"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [sentReset, setSentReset] = useState(false);
  const router = useRouter();

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      toast({ title: "No pude entrar", description: error.message, variant: "destructive" });
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "No pude enviar el link", description: error.message, variant: "destructive" });
      return;
    }
    setSentReset(true);
    toast({ title: "Revisá tu correo", description: "Te llegó un enlace para definir contraseña.", variant: "success" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-camino-yellow bg-cream-100">
            <span className="font-display text-2xl text-camino-ink">EC</span>
          </div>
          <h1 className="font-display text-3xl text-camino-ink">El Camino con Naty</h1>
          <p className="text-sm text-muted-foreground mt-1">Plataforma comercial</p>
          <div className="brand-yellow-bar mx-auto mt-3" />
        </div>

        <Card>
          {mode === "login" ? (
            <>
              <CardHeader>
                <CardTitle className="text-xl">Entrar</CardTitle>
                <CardDescription>Ingresá con tu correo y contraseña.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      placeholder="tu@correo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" variant="accent" className="w-full" disabled={loading || !email || !password}>
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); setSentReset(false); }}
                    className="block w-full text-center text-xs text-camino-deepYellow hover:underline mt-2"
                  >
                    ¿Olvidaste tu contraseña? / ¿Primera vez?
                  </button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-xl">Definir contraseña</CardTitle>
                <CardDescription>
                  Te enviamos un enlace para crear o restablecer tu contraseña.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sentReset ? (
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>Listo. Revisá <strong>{email}</strong>.</p>
                    <p>Tocá el enlace, definí una contraseña y volvés a entrar acá.</p>
                    <Button variant="ghost" onClick={() => { setMode("login"); setSentReset(false); }} className="mt-3">
                      Volver a entrar
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={onForgot} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email2">Correo</Label>
                      <Input
                        id="email2"
                        type="email"
                        required
                        placeholder="tu@correo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </div>
                    <Button type="submit" variant="accent" className="w-full" disabled={loading || !email}>
                      {loading ? "Enviando..." : "Enviarme enlace"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="block w-full text-center text-xs text-camino-deepYellow hover:underline mt-2"
                    >
                      Volver a entrar con contraseña
                    </button>
                  </form>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
