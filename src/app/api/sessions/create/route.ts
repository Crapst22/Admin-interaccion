import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { bracket_id, duration_seconds, matches } = await req.json();
  const duration = Math.max(5, Math.min(300, Number(duration_seconds) || 30));
  // matches: array of {round,slot,item_a_id,item_b_id,winner_id,status,votes_a,votes_b,next_index,next_slot}
  const { data: bracket } = await supabase.from("brackets").select("id").eq("id", bracket_id).eq("owner_id", user.id).single();
  if (!bracket) return NextResponse.json({ error: "Llave no encontrada" }, { status: 404 });
  const admin = createAdminClient();
  const { data: session, error: sErr } = await admin.from("sessions").insert({ bracket_id, owner_id: user.id, status: "waiting", duration_seconds: duration }).select("*").single();
  if (sErr || !session) return NextResponse.json({ error: sErr?.message }, { status: 500 });
  // insertar matches en dos pasadas para next_match_id
  const idMap: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const { data: ins, error } = await admin.from("matches").insert({
      session_id: session.id, round: m.round, slot: m.slot,
      item_a_id: m.item_a_id, item_b_id: m.item_b_id,
      winner_id: m.winner_id || null, votes_a: 0, votes_b: 0,
      status: m.status || "pending", voting_ends_at: null,
    }).select("id").single();
    if (error || !ins) return NextResponse.json({ error: error?.message }, { status: 500 });
    idMap[i] = ins.id;
  }
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.next_index != null) {
      await admin.from("matches").update({ next_match_id: idMap[m.next_index], next_slot: m.next_slot }).eq("id", idMap[i]);
    }
  }
  return NextResponse.json({ session, matchIds: idMap });
}
