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
  const [items, setItems] = useState<Record<string, Item>>({});
  const [voted, setVoted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowOffset, setNowOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  async function syncTime() {
    try { const r = await fetch(`/api/time`); const j = await r.json(); setNowOffset(j.now - Date.now()); } catch {}
  }

  async function loadAll(sess?: Session | null) {
    const s = sess ?? (await supabase.from("sessions").select("*").eq("id", params.sessionId).single()).data as Session | null;
    if (!s) { setLoading(false); return; }
    setSession(s);
    const { data: its } = await supabase.from("items").select("*").eq("bracket_id", s.bracket_id);
    const map: Record<string, Item> = {}; (its || []).forEach((i: Item) => { map[i.id] = i; }); setItems(map);
    if (s.current_match_id) {
      const { data: m } = await supabase.from("matches").select("*").eq("id", s.current_match_id).single();
      setMatch(m as Match);
    } else setMatch(null);
    setLoading(false);
  }

  useEffect(() => {
    loadAll(); syncTime();
    const ch = supabase.channel(`vote-${params.sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `id=eq.${params.sessionId}` }, (p) => {
        const s = p.new as Session; setSession(s); loadAll(s); setVoted(null); setError(null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `session_id=eq.${params.sessionId}` }, (p) => {
        const m = p.new as Match; setMatch(cur => (cur?.id === m.id ? m : (cur ?? m)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sessionId]);

  async function vote(choice: "a" | "b") {
    if (!match) return; setError(null);
    const device_id = getDeviceId();
    const res = await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: match.id, device_id, choice }) });
    const j = await res.json();
    if (!j.ok) { setError(j.error || "No se pudo votar."); if ((j.error||"").includes("Ya registraste")) setVoted(choice); return; }
    setVoted(choice);
  }

  const a = match?.item_a_id ? items[match.item_a_id] : null;
  const b = match?.item_b_id ? items[match.item_b_id] : null;
  const ended = match?.voting_ends_at ? (Date.now() + nowOffset) > new Date(match.voting_ends_at).getTime() : false;
  const active = session?.status === "running" && match?.status === "voting" && !ended;

  if (loading) return <main className="min-h-screen flex items-center justify-center p-6"><p className="text-xl">Cargando…</p></main>;
  if (!session) return <main className="min-h-screen flex items-center justify-center p-6"><p className="text-xl">Sesión no encontrada.</p></main>;

  if (session.status === "finished") {
    // mostrar ganador si se puede inferir del último match done con mayor ronda? simplificado: mensaje
    return <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
      <h1 className="text-4xl font-extrabold">¡Gracias por participar!</h1>
      <p className="text-slate-300 text-xl">La votación ha finalizado.</p>
    </main>;
  }

  if (!active) {
    const showWinner = match?.status === "done" && match.winner_id ? items[match.winner_id] : null;
    return <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
      <h1 className="text-3xl font-bold">Esperá, la votación va a comenzar…</h1>
      <p className="text-slate-400">Se actualizará automáticamente.</p>
      {showWinner && <div className="mt-4 card p-4"><p className="text-amber-400 font-semibold mb-2">Pasa a la siguiente ronda:</p><p className="text-2xl font-bold">{showWinner.name}</p></div>}
    </main>;
  }

  if (voted) {
    const chosen = voted === "a" ? a : b;
    return <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
      <h1 className="text-4xl font-extrabold text-emerald-400">¡Voto registrado!</h1>
      {chosen && <p className="text-2xl">Elegiste: <b>{chosen.name}</b></p>}
      <p className="text-slate-400">Esperá el siguiente enfrentamiento…</p>
    </main>;
  }

  return (
    <main className="min-h-screen flex flex-col p-4 gap-4">
      <h1 className="text-center text-2xl font-bold">¿Cuál pasa?</h1>
      {error && <p className="text-center text-rose-400">{error}</p>}
      <div className="flex-1 grid grid-rows-2 gap-4">
        {([["a", a], ["b", b]] as const).map(([key, it]) => (
          <button key={key} disabled={!it} onClick={()=>vote(key)} className="card relative overflow-hidden flex flex-col items-center justify-center p-4 active:scale-[0.99] transition border-2 border-transparent hover:border-amber-500 disabled:opacity-40">
            {it ? (<><div className="relative w-40 h-40 sm:w-56 sm:h-56 rounded-xl overflow-hidden bg-slate-900"><Image src={it.image_url} alt={it.name} fill className="object-cover" unoptimized /></div><span className="mt-3 text-2xl sm:text-3xl font-extrabold text-center">{it.name}</span></>) : <span>—</span>}
          </button>
        ))}
      </div>
    </main>
  );
}
