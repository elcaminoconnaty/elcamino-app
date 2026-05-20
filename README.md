# El Camino con Naty — Plataforma Comercial

App interna para gestionar peregrinos, pagos, proveedores, reservas, presupuesto y finanzas de la agencia "El Camino con Naty".

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** + componentes propios estilo shadcn
- **Supabase** (Auth, Postgres con schema `elcamino`, RLS)
- **@react-pdf/renderer** para recibos y reportes
- **Railway** para deploy

## Variables de entorno

Las credenciales del proyecto Supabase nuevo (separado del de Camino Sacro):

```
NEXT_PUBLIC_SUPABASE_URL=https://btunvfrxegjwpznlmvjp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_SOGehRHFABOoyUHu1OfTHQ_282e2Kkj
```

Copiar `.env.example` a `.env.local` para desarrollo.

## Desarrollo local

```bash
npm install
npm run dev
```

Abrir http://localhost:3000.

## Setup del primer usuario

1. Entrar a `/login`.
2. Pedir magic link con tu email (`detrasdecamarasch@gmail.com`).
3. Revisar Gmail y tocar el enlace. Se crea automáticamente un `profile` con rol `nico`.

Para promover a Naty a su rol propio, desde el SQL editor de Supabase:

```sql
update elcamino.profiles set app_role = 'naty' where email = 'natalia@correo.com';
```

## Deploy a Railway

### Opción A — CLI (recomendada para primera vez)

```bash
railway login                     # autenticarte (abre browser)
cd elcamino-app
railway init                      # elegir/crear proyecto "el-camino-con-naty"
railway variables --set NEXT_PUBLIC_SUPABASE_URL=https://btunvfrxegjwpznlmvjp.supabase.co
railway variables --set NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_SOGehRHFABOoyUHu1OfTHQ_282e2Kkj
railway up                        # primer deploy
railway domain                    # generar URL pública
```

### Opción B — desde GitHub

1. Subir este repo a GitHub.
2. En Railway → New Project → Deploy from GitHub repo.
3. Seleccionar el repo y la carpeta raíz `elcamino-app/`.
4. Agregar las variables de entorno arriba.
5. Railway auto-detecta Next.js vía Nixpacks y despliega.

### Configurar URL de redirección en Supabase

Después del deploy, ir a Supabase → Authentication → URL Configuration y agregar la URL de Railway (ej. `https://elcamino-production.up.railway.app/auth/callback`) en **Redirect URLs**.

## Modelos importantes

- **`routes`**: plantillas de ruta (Camino Francés 115 km, Portugués Costero, MANADA).
- **`departures`**: salidas grupales con fecha (Septiembre 2026, Abril 2027, etc.). Todo se filtra por salida.
- **`pilgrims`** + **`registrations`**: peregrino ↔ salida con su precio acordado.
- **`pilgrim_payments`**: pagos del peregrino con TRM aplicada al momento.
- **`trm_rates`**: TRM EUR/COP manual diaria.
- **`providers`** + **`reservations`** + **`provider_payments`**: logística.
- **`budget_items`**: presupuesto versátil por salida (estimado vs confirmado).
- **`expenses`**: gastos operativos + retiros personales de Naty (separados).

Vistas:
- `v_pilgrim_balance` — saldo por inscripción.
- `v_departure_summary` — KPIs por salida.
- `v_financial_global` — dashboard global de Naty.

## Recálculo TRM 1 mes antes

Es **manual**: en el detalle de un camino aparece un banner cuando faltan ≤30 días para la salida y permite congelar la TRM con un botón. Desde ahí los saldos COP de los peregrinos se calculan con la tasa congelada y los recibos PDF reflejan la cláusula.

## V2 — futuro

- Envío automático de recibos y reportes desde elcaminoconnaty@gmail.com vía n8n.
- Lectura del inbox para actualizar reservas automáticamente.
- Portal del peregrino.
- TRM diaria automática.
