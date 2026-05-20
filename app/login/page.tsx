"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      toast({ title: "No pude enviar el link", description: error.message, variant: "destructive" });
      return;
    }
    setSent(true);
    toast({ title: "Revisá tu correo", description: "Te llegó un enlace para entrar.", variant: "success" });
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
          <CardHeader>
            <CardTitle className="text-xl">Entrar</CardTitle>
            <CardDescription>Te enviamos un enlace mágico a tu correo.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Listo. Revisá <strong>{email}</strong>.</p>
                <p>Tocá el enlace que te llegó para entrar.</p>
                <Button variant="ghost" onClick={() => setSent(false)} className="mt-3">
                  Usar otro correo
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
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
                <Button type="submit" variant="accent" className="w-full" disabled={loading || !email}>
                  {loading ? "Enviando..." : "Enviarme enlace"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
