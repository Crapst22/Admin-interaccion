import type { SupabaseClient } from "@supabase/supabase-js";

type DbMatch = {
  id: string; session_id: string; round: number; slot: number;
  item_a_id: string | null; item_b_id: string | null; winner_id: string | null;
  votes_a: number; votes_b: number; status: string; voting_ends_at: string | null;
  next_match_id: string | null; next_slot: "a" | "b" | null;
};

// Lógica de avance de sesión (lado servidor, usa cliente admin/service role)
export async function resolveByesAndOpenNext(admin: SupabaseClient, sessionId: string, duration: number) {
  for (let guard = 0; guard < 30; guard++) {
    let changed = false;
    const { data } = await admin.from("matches").select("*").eq("session_id", sessionId).order("round").order("slot");
    const matches = (data || []) as DbMatch[];
    if (!matches.length) break;
    for (const m of matches) {
      if (m.status === "done" && m.winner_id && m.next_match_id) {
        const field = m.next_slot === "a" ? "item_a_id" : "item_b_id";
        const next = matches.find((x) => x.id === m.next_match_id);
        if (next && !next[field]) {
          await admin.from("matches").update({ [field]: m.winner_id }).eq("id", next.id);
          (next as Record<string, unknown>)[field] = m.winner_id;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const { data: currentVoting } = await admin.from("matches").select("id").eq("session_id", sessionId).eq("status", "voting").maybeSingle();
  if (currentVoting) { await admin.from("sessions").update({ current_match_id: (currentVoting as { id: string }).id }).eq("id", sessionId); return; }
  const { data: pending } = await admin.from("matches").select("*").eq("session_id", sessionId).eq("status", "pending").order("round").order("slot");
  const next = ((pending || []) as DbMatch[]).find((m) => m.item_a_id && m.item_b_id);
  if (next) {
    const ends = new Date(Date.now() + duration * 1000).toISOString();
    await admin.from("matches").update({ status: "voting", voting_ends_at: ends }).eq("id", next.id);
    await admin.from("sessions").update({ current_match_id: next.id, status: "running" }).eq("id", sessionId);
    return;
  }
  const { data: anyPending } = await admin.from("matches").select("id").eq("session_id", sessionId).eq("status", "pending").limit(1);
  if (!anyPending || anyPending.length === 0) {
    await admin.from("sessions").update({ status: "finished", current_match_id: null }).eq("id", sessionId);
  } else {
    await admin.from("sessions").update({ current_match_id: null }).eq("id", sessionId);
  }
}

