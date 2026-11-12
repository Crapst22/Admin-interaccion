import { createClient } from "@supabase/supabase-js";

// Cliente con service role: SOLO en servidor (Route Handlers). Nunca importar en cliente.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
