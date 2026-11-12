import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { action } = await req.json().catch(()=>({action:"pause"}));
  const admin = createAdminClient();
  const { data: session } = await admin.from("sessions").select("*").eq("id", params.id).eq("owner_id", user.id).single();
  if (!session) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (session.current_match_id) {
    if (action === "pause") {
      // pausar: mover ends al futuro lejano guardando remaining? simplificado: +1h
      await admin.from("matches").update({ voting_ends_at: new Date(Date.now()+3600000).toISOString() }).eq("id", session.current_match_id);
    } else if (action === "resume") {
      await admin.from("matches").update({ voting_ends_at: new Date(Date.now()+session.duration_seconds*1000).toISOString() }).eq("id", session.current_match_id);
    }
  }
  return NextResponse.json({ ok: true });
}
