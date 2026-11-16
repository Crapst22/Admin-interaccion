import type { SupabaseClient } from "@supabase/supabase-js";

type DbMatch = {
  id: string; session_id: string; slot: number; item_id: string | null;
  votes_high: number; votes_medium: number; votes_low: number;
  status: string; voting_ends_at: string | null;
};

export async function openNextTurn(admin: SupabaseClient, sessionId: string, duration: number) {
  const { data: currentVoting } = await admin.from("matches").select("id").eq("session_id", sessionId).eq("status", "voting").maybeSingle();
  if (currentVoting) {
    await admin.from("sessions").update({ current_match_id: (currentVoting as { id: string }).id }).eq("id", sessionId);
    return;
  }
  const { data: pending } = await admin.from("matches").select("*").eq("session_id", sessionId).eq("status", "pending").order("slot");
  const next = ((pending || []) as DbMatch[]).find(m => m.item_id);
  if (next) {
    const dur = Math.max(5, Math.min(300, Number(duration) || 30));
    const ends = new Date(Date.now() + dur * 1000).toISOString();
    await admin.from("matches").update({ status: "voting", voting_ends_at: ends }).eq("id", next.id);
    await admin.from("sessions").update({ current_match_id: next.id, status: "running" }).eq("id", sessionId);
    return;
  }
  await admin.from("sessions").update({ status: "finished", current_match_id: null }).eq("id", sessionId);
}
