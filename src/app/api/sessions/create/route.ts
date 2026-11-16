import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { bracket_id, duration_seconds, matches } = await req.json();
  const duration = Math.max(5, Math.min(300, Number(duration_seconds) || 30));
  const { data: bracket } = await supabase.from("brackets").select("id").eq("id", bracket_id).eq("owner_id", user.id).single();
  if (!bracket) return NextResponse.json({ error: "Listado no encontrado" }, { status: 404 });
  const admin = createAdminClient();
  const { data: session, error: sErr } = await admin.from("sessions").insert({ bracket_id, owner_id: user.id, status: "waiting", duration_seconds: duration }).select("*").single();
  if (sErr || !session) return NextResponse.json({ error: sErr?.message }, { status: 500 });
  const rows = (matches || []).map((m: { slot: number; item_id: string }) => ({
    session_id: session.id, round: 1, slot: m.slot, item_id: m.item_id,
    status: "pending", votes_high: 0, votes_medium: 0, votes_low: 0, voting_ends_at: null,
  }));
  if (rows.length) {
    const { error } = await admin.from("matches").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ session });
}
