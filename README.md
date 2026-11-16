# Clasificación de Riesgos (alto / medio / bajo)

App web con Next.js + Supabase para votar y clasificar riesgos en vivo desde el celular (QR).

## Flujo
1. Creá un listado (nombre + pregunta/título + riesgos con imagen).
2. Iniciá votación: elegí segundos por turno, generá la sala y mostrá el QR.
3. Cada turno muestra un riesgo: el público vota **Alta (rojo)**, **Media (naranja)** o **Baja (amarillo)**. En el presentador se ven los votos en barras en tiempo real.
4. Al finalizar se muestra la tabla de resultados ordenada de Alta a Baja (y por mayor cantidad de votos del nivel en empates), con el color de cada nivel.

## Requisitos
- Node.js 18+
- Proyecto en Supabase y despliegue en Vercel

## Configuración
1. Ejecutá `supabase/schema.sql` en el SQL Editor de Supabase (tablas, RLS, bucket `images`, RPC `cast_vote`, Realtime).
2. En Auth > Providers > Email desactivá **Confirm email** (para uso en expo).
3. Variables de entorno (ver `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
4. `npm install` y `npm run dev`.

Los votos se registran por `POST /api/vote` con `SUPABASE_SERVICE_ROLE_KEY` en servidor vía RPC (valida estado/tiempo y un voto por dispositivo y turno). Clientes solo leen `sessions/matches/items` por Realtime.