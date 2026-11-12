import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveByesAndOpenNext } from "@/lib/session";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const admin = createAdminClient();
  const { data: session } = await admin.from("sessions").select("*").eq("id", params.id).eq("owner_id", user.id).single();
  if (!session) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  await admin.from("sessions").update({ status: "running" }).eq("id", params.id);
  await resolveByesAndOpenNext(admin, params.id, session.duration_seconds);
  const { data: updated } = await admin.from("sessions").select("*").eq("id", params.id).single();
  return NextResponse.json({ session: updated });
}

