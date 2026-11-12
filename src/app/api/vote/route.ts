import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { match_id, device_id, choice } = await req.json();
    if (!match_id || !device_id || !["a", "b"].includes(choice)) {
      return NextResponse.json({ ok: false, error: "Datos inválidos." }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("cast_vote", { p_match_id: match_id, p_device_id: device_id, p_choice: choice });
    if (error) return NextResponse.json({ ok: false, error: "No se pudo registrar el voto." }, { status: 500 });
    const res = data as { ok: boolean; error?: string };
    if (!res.ok) return NextResponse.json(res, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }
}
