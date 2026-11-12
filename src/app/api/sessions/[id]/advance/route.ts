import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveByesAndOpenNext } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { match_id, extend, force_finish } = await req.json().catch(()=>({}));
  const admin = createAdminClient();
  const { data: session } = await admin.from("sessions").select("*").eq("id", params.id).eq("owner_id", user.id).single();
  if (!session) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  if (extend && match_id) {
    const { data: m } = await admin.from("matches").select("voting_ends_at,status").eq("id", match_id).single();
    if (m && m.status === "voting") {
      const base = m.voting_ends_at ? Math.max(Date.now(), new Date(m.voting_ends_at).getTime()) : Date.now();
      await admin.from("matches").update({ voting_ends_at: new Date(base + 10000).toISOString() }).eq("id", match_id);
    }
    return NextResponse.json({ ok: true });
  }

  const mid = match_id || session.current_match_id;
  if (mid) {
    const { data: m } = await admin.from("matches").select("*").eq("id", mid).single();
    if (m && m.status === "voting") {
      let winnerId = m.winner_id;
      if (!winnerId) {
        if (m.votes_a > m.votes_b) winnerId = m.item_a_id;
        else if (m.votes_b > m.votes_a) winnerId = m.item_b_id;
      }
      if (!winnerId) {
        // Empate: repetir votación (reiniciar votos y tiempo)
        await admin.from("votes").delete().eq("match_id", mid);
        const ends = new Date(Date.now() + (session.duration_seconds || 30) * 1000).toISOString();
        await admin.from("matches").update({ votes_a: 0, votes_b: 0, voting_ends_at: ends, status: "voting" }).eq("id", mid);
        await admin.from("sessions").update({ current_match_id: mid, status: "running" }).eq("id", session.id);
        const { data: updated } = await admin.from("sessions").select("*").eq("id", session.id).single();
        return NextResponse.json({ session: updated, tie: true });
      }
      await admin.from("matches").update({ status: "done", winner_id: winnerId, voting_ends_at: new Date().toISOString() }).eq("id", mid);
      if (winnerId && m.next_match_id) {
        const field = m.next_slot === "a" ? "item_a_id" : "item_b_id";
        await admin.from("matches").update({ [field]: winnerId }).eq("id", m.next_match_id);
      }
    }
  }
  await admin.from("sessions").update({ current_match_id: null }).eq("id", session.id);
  await resolveByesAndOpenNext(admin, session.id, session.duration_seconds);
  if (force_finish) await admin.from("sessions").update({ status: "finished", current_match_id: null }).eq("id", session.id);
  const { data: updated } = await admin.from("sessions").select("*").eq("id", session.id).single();
  return NextResponse.json({ session: updated, tie: false });
}
