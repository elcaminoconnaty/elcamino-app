"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { crearClaveInicial, entrarConCedula, estadoCedula } from "@/lib/actions/acceso";

/**
 * Cada persona del equipo entra con su cédula (ver `lib/actions/acceso.ts`).
 *
 * Paso 1, la cédula. Paso 2, según la cuenta: su contraseña, o crearla si es la primera vez.
 * El ingreso por correo queda abajo, pequeño, para la cuenta compartida de antes mientras
 * se retira.
 */
type Paso = "cedula" | "clave" | "crear" | "correo";

export default function LoginPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("cedula");
  const [cedula, setCedula] = useState("");
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [loading, setLoading] = useState(false);

  function falla(error: string) {
    toast({ title: "No pude entrar", description: error, variant: "destructive" });
  }

  function adentro() {
    router.replace("/");
    router.refresh();
  }

  async function onCedula(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await estadoCedula(cedula);
    setLoading(false);
    if (!r.ok) return falla(r.error);
    setClave("");
    setClave2("");
    setPaso(r.estado === "nueva" ? "crear" : "clave");
  }

  async function onClave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await entrarConCedula(cedula, clave);
    if (!r.ok) {
      setLoading(false);
      return falla(r.error);
    }
    adentro();
  }

  async function onCrear(e: React.FormEvent) {
    e.preventDefault();
    if (clave !== clave2) return falla("Las dos contraseñas no coinciden.");
    setLoading(true);
    const r = await crearClaveInicial(cedula, clave);
    if (!r.ok) {
      setLoading(false);
      return falla(r.error);
    }
    toast({ title: "Listo", description: "Tu contraseña quedó creada.", variant: "success" });
    adentro();
  }

  const volver = (
    <button
      type="button"
      onClick={() => { setPaso("cedula"); setLoading(false); }}
      className="block w-full text-center text-xs text-ocre-profundo hover:underline mt-2 py-2"
    >
      Usar otra cédula
    </button>
  );

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-alba px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-ocre bg-piedra-suave">
            <span className="font-display text-2xl text-noche">EC</span>
          </div>
          <h1 className="font-display text-3xl text-noche">El Camino con Naty</h1>
          <p className="text-sm text-muted-foreground mt-1">Plataforma comercial</p>
          <div className="brand-yellow-bar mx-auto mt-3" />
        </div>

        <Card>
          {paso === "cedula" && (
            <>
              <CardHeader>
                <CardTitle className="text-xl">Entrar</CardTitle>
                <CardDescription>Escribí tu número de cédula.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onCedula} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cedula">Cédula</Label>
                    <Input
                      id="cedula"
                      inputMode="numeric"
                      pattern="[0-9 .]*"
                      required
                      autoFocus
                      placeholder="1234567890"
                      value={cedula}
                      onChange={(e) => setCedula(e.target.value)}
                      autoComplete="username"
                      className="text-base"
                    />
                  </div>
                  <Button type="submit" variant="accent" className="w-full h-11" disabled={loading || cedula.replace(/\D/g, "").length < 5}>
                    {loading ? "Revisando..." : "Continuar"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setPaso("correo")}
                    className="block w-full text-center text-xs text-muted-foreground hover:underline mt-2 py-2"
                  >
                    Entrar con correo (cuenta anterior)
                  </button>
                </form>
              </CardContent>
            </>
          )}

          {paso === "clave" && (
            <>
              <CardHeader>
                <CardTitle className="text-xl">Tu contraseña</CardTitle>
                <CardDescription>Cédula {cedula.replace(/\D/g, "")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onClave} className="space-y-4">
                  {/* El campo de usuario oculto le dice al llavero del iPhone qué guardar. */}
                  <input type="text" name="username" autoComplete="username" value={cedula.replace(/\D/g, "")} readOnly hidden />
                  <div className="space-y-2">
                    <Label htmlFor="clave">Contraseña</Label>
                    <Input
                      id="clave"
                      type="password"
                      required
                      autoFocus
                      value={clave}
                      onChange={(e) => setClave(e.target.value)}
                      autoComplete="current-password"
                      className="text-base"
                    />
                  </div>
                  <Button type="submit" variant="accent" className="w-full h-11" disabled={loading || !clave}>
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    ¿La olvidaste? Pedile a la otra persona del equipo que la restablezca en Configuración → Equipo.
                  </p>
                  {volver}
                </form>
              </CardContent>
            </>
          )}

          {paso === "crear" && (
            <>
              <CardHeader>
                <CardTitle className="text-xl">Creá tu contraseña</CardTitle>
                <CardDescription>
                  Es la primera vez que entrás con la cédula {cedula.replace(/\D/g, "")}. Elegí una contraseña de al menos 8 caracteres.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onCrear} className="space-y-4">
                  <input type="text" name="username" autoComplete="username" value={cedula.replace(/\D/g, "")} readOnly hidden />
                  <div className="space-y-2">
                    <Label htmlFor="nueva">Contraseña nueva</Label>
                    <Input
                      id="nueva"
                      type="password"
                      required
                      autoFocus
                      minLength={8}
                      value={clave}
                      onChange={(e) => setClave(e.target.value)}
                      autoComplete="new-password"
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nueva2">Repetila</Label>
                    <Input
                      id="nueva2"
                      type="password"
                      required
                      minLength={8}
                      value={clave2}
                      onChange={(e) => setClave2(e.target.value)}
                      autoComplete="new-password"
                      className="text-base"
                    />
                  </div>
                  <Button type="submit" variant="accent" className="w-full h-11" disabled={loading || clave.length < 8 || !clave2}>
                    {loading ? "Guardando..." : "Crear y entrar"}
                  </Button>
                  {volver}
                </form>
              </CardContent>
            </>
          )}

          {paso === "correo" && <EntrarConCorreo onVolver={() => setPaso("cedula")} onAdentro={adentro} />}
        </Card>
      </div>
    </div>
  );
}

/** La cuenta compartida de antes (elcaminoconnaty@gmail.com). */
function EntrarConCorreo({ onVolver, onAdentro }: { onVolver: () => void; onAdentro: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast({ title: "No pude entrar", description: error.message, variant: "destructive" });
      return;
    }
    onAdentro();
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl">Entrar con correo</CardTitle>
        <CardDescription>
          Solo para la cuenta compartida de antes. Lo que hagas con ella no queda a tu nombre.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="text-base" />
          </div>
          <Button type="submit" variant="accent" className="w-full h-11" disabled={loading || !email || !password}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          <button type="button" onClick={onVolver} className="block w-full text-center text-xs text-ocre-profundo hover:underline mt-2 py-2">
            Volver a entrar con cédula
          </button>
        </form>
      </CardContent>
    </>
  );
}
