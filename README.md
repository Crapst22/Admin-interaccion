# Torneo de Riesgos (votación en llaves)

Aplicación web con Next.js + Supabase para crear llaves eliminatorias y votar en vivo desde el celular (QR).

## Requisitos
- Node.js 18+
- Cuenta y proyecto en [Supabase](https://supabase.com)
- Cuenta en [Vercel](https://vercel.com) para desplegar

## 1. Crear proyecto en Supabase
1. Creá un proyecto nuevo en Supabase.
2. En **Project Settings → API** copiá:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, nunca al cliente)

## 2. Ejecutar el SQL
1. Abrí **SQL Editor** en Supabase y pegá el contenido de [`supabase/schema.sql`](supabase/schema.sql).
2. Ejecutalo completo. Crea tablas, RLS, bucket público `images`, la función RPC `cast_vote` y agrega `matches`/`sessions` a Realtime.

## 3. Auth: desactivar confirmación de email (para la expo)
1. En **Authentication → Providers → Email** desactivá **Confirm email**.
2. Así el registro inicia sesión de inmediato sin correo de verificación.

## 4. Variables de entorno
Copiá `.env.example` a `.env.local` y completá:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 5. Ejecutar localmente
```bash
npm install
npm run dev
```
Abrí [http://localhost:3000](http://localhost:3000).

## 6. Desplegar en Vercel
1. Subí el repo a GitHub y importalo en Vercel (o `vercel` CLI).
2. En **Project → Settings → Environment Variables** cargá las 4 variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` = `https://tu-app.vercel.app` (URL pública real, usada en el QR)
3. Desplegá. Rehacé deploy si cambiás variables.

## Uso rápido
1. Registrate/iniciá sesión en `/login`.
2. En el dashboard creá una llave (o usá **“Cargar ejemplo”** con 8 riesgos).
3. Abrí **Iniciar votación**: configurá segundos, generá/mezclá la llave y creá la sala.
4. Mostrá el **QR**; el público entra a `/vote/[sessionId]` desde el celular (un voto por dispositivo por enfrentamiento).
5. Presioná **Iniciar**: el temporizador se basa en `voting_ends_at` (sincronizado con hora del servidor). Al terminar cada cruce avanza automático; los empates se resuelven al azar.
6. Al final se muestra el ganador y la tabla de posiciones (votos acumulados de toda la sesión por elemento).

## Notas de seguridad/arquitectura
- Los votos se registran por `POST /api/vote` usando `SUPABASE_SERVICE_ROLE_KEY` solo en servidor y la RPC `cast_vote` (valida estado/tiempo y `UNIQUE(match_id,device_id)`).
- La tabla `votes` no es legible por clientes; host y votantes se suscriben en Realtime a `matches` y `sessions`.
- RLS: cada usuario gestiona solo sus llaves/sesiones; lectura pública de sesiones/matches/items para votar.
