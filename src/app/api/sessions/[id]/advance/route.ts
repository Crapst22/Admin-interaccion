import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { openNextTurn } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { match_id } = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const { data: session } = await admin.from("sessions").select("*").eq("id", params.id).eq("owner_id", user.id).single();
  if (!session) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const mid = match_id || session.current_match_id;
  if (mid) {
    const { data: m } = await admin.from("matches").select("id,status").eq("id", mid).single();
    if (m && m.status === "voting") {
      await admin.from("matches").update({ status: "done", voting_ends_at: new Date().toISOString() }).eq("id", mid);
    }
  }
  await admin.from("sessions").update({ current_match_id: null }).eq("id", session.id);
  await openNextTurn(admin, session.id, session.duration_seconds);
  const { data: updated } = await admin.from("sessions").select("*").eq("id", session.id).single();
  return NextResponse.json({ session: updated });
}