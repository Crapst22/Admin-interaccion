"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/device";
import { Item, Match, Session } from "@/types/db";
import Image from "next/image";

export default function VotePage({ params }: { params: { sessionId: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [title, setTitle] = useState("");
  const [voted, setVoted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowOffset, setNowOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [localEnd, setLocalEnd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function syncTime() {
    try { const r = await fetch(`/api/time`, { cache: "no-store" }); const j = await r.json(); setNowOffset(j.now - Date.now()); } catch {}
  }

  async function loadAll(sess?: Session | null) {
    const s = sess ?? (await supabase.from("sessions").select("*").eq("id", params.sessionId).single()).data as Session | null;
    if (!s) { setLoading(false); return; }
    setSession(s);
    const { data: b } = await supabase.from("brackets").select("title").eq("id", s.bracket_id).single();
    if (b) setTitle((b as { title?: string }).title || "");
    if (s.current_match_id) {
      const { data: m } = await supabase.from("matches").select("*").eq("id", s.current_match_id).single();
      const mm = m as Match | null; setMatch(mm);
      if (mm?.item_id) {
        const { data: it } = await supabase.from("items").select("*").eq("id", mm.item_id).single();
        setItem((it as Item) || null);
      } else setItem(null);
    } else { setMatch(null); setItem(null); }
    setLoading(false);
  }

  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 250); return () => clearInterval(t); }, []);
  const duration = session?.duration_seconds || 30;

  useEffect(() => {
    if (match?.status !== "voting") { setLocalEnd(null); return; }
    const durationMs = duration * 1000;
    const endsAt = match.voting_ends_at ? new Date(match.voting_ends_at).getTime() : null;
    if (!endsAt) { setLocalEnd(Date.now() + durationMs); return; }
    const remaining = endsAt - (Date.now() + nowOffset);
    if (remaining <= 0) { setLocalEnd(Date.now() - 1); return; }
    setLocalEnd(remaining <= durationMs + 3000 ? Date.now() + remaining : Date.now() + durationMs);
  }, [match?.id, match?.status, match?.voting_ends_at, duration, nowOffset]);

  useEffect(() => {
    loadAll(); syncTime();
    const ch = supabase.channel(`vote-${params.sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `id=eq.${params.sessionId}` }, (p) => {
        const s = p.new as Session; setSession(s); loadAll(s); setVoted(null); setError(null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `session_id=eq.${params.sessionId}` }, (p) => {
        const m = p.new as Match; setMatch(cur => (cur?.id === m.id ? m : cur));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sessionId]);

  useEffect(() => {
    setVoted(null); setError(null);
  }, [match?.id]);

  useEffect(() => {
    if (!session) return;
    const iv = setInterval(() => { loadAll(); }, 2000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  async function vote(choice: "high" | "medium" | "low") {
    if (!match) return; setError(null);
    const device_id = getDeviceId();
    const res = await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: match.id, device_id, choice }) });
    const j = await res.json();
    if (!j.ok) {
      const msg = j.detail ? `${j.error || "No se pudo votar."} (${j.detail})` : (j.error || "No se pudo votar.");
      setError(msg);
      return;
    }
    setVoted(choice);
  }

  const ended = localEnd ? tick >= localEnd : false;
  const timeLeft = localEnd ? Math.max(0, Math.ceil((localEnd - tick) / 1000)) : duration;
  const active = session?.status === "running" && match?.status === "voting" && !ended;

  if (loading) return <main className="min-h-screen flex items-center justify-center p-6"><p className="text-xl">Cargando...</p></main>;
  if (!session) return <main className="min-h-screen flex items-center justify-center p-6"><p className="text-xl">Sesión no encontrada.</p></main>;

  if (session.status === "finished") {
    return <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
      <h1 className="text-4xl font-extrabold">¡Gracias por participar!</h1>
      <p className="text-slate-300 text-xl">La votación ha finalizado.</p>
    </main>;
  }

  if (!active) {
    return <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
      <h1 className="text-3xl font-bold">Esperá, la votación va a comenzar.</h1>
      <p className="text-slate-400">Se actualizará automáticamente.</p>
    </main>;
  }

  if (voted) {
    const label = voted === "high" ? "Alta" : voted === "medium" ? "Media" : "Baja";
    return <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
      <h1 className="text-4xl font-extrabold text-emerald-400">¡Voto registrado!</h1>
      <p className="text-2xl">Elegiste: <b>{label}</b></p>
      <p className="text-slate-400">Esperá el siguiente riesgo.</p>
      {error && <p className="text-center text-rose-400">{error}</p>}
      <button onClick={() => { setVoted(null); setError(null); }} className="btn btn-secondary mt-2">Cambiar voto</button>
    </main>;
  }

  return (
    <main className="min-h-screen flex flex-col p-4 gap-4">
      <div className="flex flex-col items-center gap-2">
        {title && <p className="text-center text-lg font-semibold text-amber-300">{title}</p>}
        <div className="text-3xl font-mono font-bold text-cyan-300">{timeLeft}s</div>
        <div className="w-full max-w-md h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.min(100, (timeLeft / duration) * 100)}%` }} /></div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        {item && (
          <div className="w-full max-w-md card p-4 flex flex-col items-center gap-3">
            <div className="relative w-full aspect-[1600/836] rounded-xl overflow-hidden bg-slate-900">
              <Image src={item.image_url} alt={item.name} fill className="object-contain" unoptimized />
            </div>
            <span className="text-2xl font-extrabold text-center">{item.name}</span>
          </div>
        )}
      </div>
      {error && <p className="text-center text-rose-400">{error}</p>}
      <div className="grid grid-cols-1 gap-3 pb-2">
        <button onClick={() => vote("high")} className="w-full rounded-xl py-4 text-xl font-extrabold text-white bg-red-600 hover:bg-red-500 active:scale-[0.99] transition">Alta</button>
        <button onClick={() => vote("medium")} className="w-full rounded-xl py-4 text-xl font-extrabold text-white bg-orange-500 hover:bg-orange-400 active:scale-[0.99] transition">Media</button>
        <button onClick={() => vote("low")} className="w-full rounded-xl py-4 text-xl font-extrabold text-slate-900 bg-yellow-400 hover:bg-yellow-300 active:scale-[0.99] transition">Baja</button>
      </div>
    </main>
  );
}
