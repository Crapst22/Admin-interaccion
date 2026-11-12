import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const admin = createAdminClient();
  const { data: session } = await admin.from("sessions").select("*").eq("id", params.id).eq("owner_id", user.id).single();
  if (!session) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  // borrar votos y resetear matches/sesión
  const { data: ms } = await admin.from("matches").select("id").eq("session_id", session.id);
  const ids = (ms || []).map((m: { id: string }) => m.id);
  if (ids.length) await admin.from("votes").delete().in("match_id", ids);
  await admin.from("matches").delete().eq("session_id", session.id);
  await admin.from("sessions").delete().eq("id", session.id);
  return NextResponse.json({ ok: true });
}
