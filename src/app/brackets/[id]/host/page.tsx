"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Item, Match, Session, Standing } from "@/types/db";
import { generateBracket, MatchNode } from "@/lib/bracket";
import { QRCodeSVG } from "qrcode.react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Confetti from "@/components/Confetti";
import StandingsTable from "@/components/StandingsTable";

type DisplayMatch = Match & { itemA?: Item | null; itemB?: Item | null };

export default function HostPage() {
  const params = useParams<{ id: string }>();
  const bracketId = params.id;
  const supabase = useMemo(() => createClient(), []);
  const [bracketName, setBracketName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [duration, setDuration] = useState(30);
  const [nodes, setNodes] = useState<MatchNode[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [dbMatches, setDbMatches] = useState<Match[]>([]);
  const [nowOffset, setNowOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [paused, setPaused] = useState(false);
  const autoAdvancing = useRef(false);

  useEffect(() => { (async () => {
    const { data: b } = await supabase.from("brackets").select("id,name").eq("id", bracketId).single();
    if (b) setBracketName((b as { name: string }).name);
    const { data: its } = await supabase.from("items").select("*").eq("bracket_id", bracketId).order("position");
    setItems((its || []) as Item[]);
  })(); }, [bracketId, supabase]);

  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 250); return () => clearInterval(t); }, []);
  const syncTime = useCallback(async () => { try { const r = await fetch("/api/time"); const j = await r.json(); setNowOffset(j.now - Date.now()); } catch {} }, []);
  useEffect(() => { syncTime(); }, [syncTime]);

  const siteUrl = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin) : "";
  const voteUrl = session ? `${siteUrl}/vote/${session.id}` : "";

  function doGenerate() { if (items.length >= 2) setNodes(generateBracket(items)); }

  async function createSession() {
    if (nodes.length === 0) return;
    const payload = nodes.map(n => ({ round: n.round, slot: n.slot, item_a_id: n.itemA?.id || null, item_b_id: n.itemB?.id || null, winner_id: n.winnerId, status: n.status, votes_a: 0, votes_b: 0, next_index: n.nextIndex, next_slot: n.nextSlot }));
    const safeDuration = Math.max(5, Math.min(300, Number(duration) || 30));
    const res = await fetch("/api/sessions/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bracket_id: bracketId, duration_seconds: safeDuration, matches: payload }) });
    const j = await res.json();
    if (!res.ok) { alert(j.error || "Error"); return; }
    setSession(j.session as Session); await loadDbMatches((j.session as Session).id);
  }

  const loadDbMatches = useCallback(async (sessionId: string) => {
    const { data } = await supabase.from("matches").select("*").eq("session_id", sessionId).order("round").order("slot");
    setDbMatches((data || []) as Match[]);
  }, [supabase]);
  const refreshSession = useCallback(async (sessionId: string) => {
    const { data } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
    if (data) setSession(data as Session);
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    const sid = session.id;
    const ch = supabase.channel(`host-${sid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `session_id=eq.${sid}` }, (p) => {
        const m = p.new as Match; setDbMatches(prev => prev.map(x => x.id === m.id ? m : x));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sid}` }, (p) => { setSession(p.new as Session); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, supabase]);

  const current = dbMatches.find(m => m.id === session?.current_match_id) || null;
  const itemMap = useMemo(() => { const m: Record<string, Item> = {}; items.forEach(i => { m[i.id] = i; }); return m; }, [items]);
  const timeLeft = current?.voting_ends_at ? Math.max(0, Math.ceil((new Date(current.voting_ends_at).getTime() - (tick + nowOffset)) / 1000)) : 0;

  useEffect(() => {
    if (!session || !current || current.status !== "voting" || paused) return;
    if (timeLeft <= 0 && !autoAdvancing.current) {
      autoAdvancing.current = true;
      const sid = session.id; const mid = current.id;
      (async () => {
        const res = await fetch(`/api/sessions/${sid}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: mid }) });
        const j = await res.json().catch(() => ({}));
        await loadDbMatches(sid); await refreshSession(sid);
        if (j.tie) {
          setNotice("Empate: se repite la votación");
          autoAdvancing.current = false;
          setTimeout(() => setNotice(null), 2500);
        } else {
          setTimeout(() => { autoAdvancing.current = false; }, 1500);
        }
      })();
    }
  }, [timeLeft, current, paused, session, loadDbMatches, refreshSession]);

  useEffect(() => { if (current?.status === "voting") autoAdvancing.current = false; }, [current?.id, current?.status]);

  const computeStandings = useCallback(async () => {
    if (!session) return;
    const { data: ms } = await supabase.from("matches").select("item_a_id,item_b_id,votes_a,votes_b").eq("session_id", session.id);
    const totals: Record<string, number> = {}; items.forEach(i => { totals[i.id] = 0; });
    ((ms || []) as { item_a_id: string | null; item_b_id: string | null; votes_a: number; votes_b: number }[]).forEach((m) => {
      if (m.item_a_id) totals[m.item_a_id] = (totals[m.item_a_id] || 0) + (m.votes_a || 0);
      if (m.item_b_id) totals[m.item_b_id] = (totals[m.item_b_id] || 0) + (m.votes_b || 0);
    });
    const st = items.map(i => ({ item_id: i.id, name: i.name, image_url: i.image_url, total_votes: totals[i.id] || 0 })).sort((a, b) => b.total_votes - a.total_votes);
    setStandings(st);
  }, [session, supabase, items]);

  useEffect(() => { if (session?.status === "finished") void computeStandings(); }, [session?.status, computeStandings]);

  async function start() { if (!session) return; await fetch(`/api/sessions/${session.id}/start`, { method: "POST" }); await loadDbMatches(session.id); await refreshSession(session.id); }
  async function skip() { if (!session) return; await fetch(`/api/sessions/${session.id}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: session.current_match_id }) }); await loadDbMatches(session.id); await refreshSession(session.id); }
  async function togglePause() { if (!session) return; const action = paused ? "resume" : "pause"; await fetch(`/api/sessions/${session.id}/pause`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); setPaused(!paused); }
  async function newSession() { if (!session) return; await fetch(`/api/sessions/${session.id}/reset`, { method: "POST" }); setSession(null); setDbMatches([]); setStandings([]); setNotice(null); }

  const rounds = useMemo(() => {
    const r: Record<number, Match[]> = {}; dbMatches.forEach(m => { (r[m.round] = r[m.round] || []).push(m); });
    Object.values(r).forEach(a => a.sort((x, y) => x.slot - y.slot)); return r;
  }, [dbMatches]);
  const roundNums = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  const championId = session?.status === "finished" && roundNums.length ? rounds[Math.max(...roundNums)][0]?.winner_id : null;
  const champion = championId ? itemMap[championId] : null;

  if (!items.length && !bracketName) return <main className="min-h-screen flex items-center justify-center">Cargando…</main>;

  if (session?.status === "finished") {
    return (
      <main className="min-h-screen p-6 md:p-10 flex flex-col items-center gap-6 relative">
        <Confetti />
        <h1 className="text-5xl font-extrabold text-amber-400 text-center">¡Ganador!</h1>
        {champion && <div className="card p-6 flex flex-col items-center gap-3"><div className="relative w-48 h-48 rounded-xl overflow-hidden"><Image src={champion.image_url} alt={champion.name} fill className="object-cover" unoptimized /></div><p className="text-4xl font-extrabold">{champion.name}</p></div>}
        <div className="w-full flex flex-col lg:flex-row gap-6 items-start justify-center">
          <StandingsTable standings={standings} />
          <div className="flex flex-col gap-3">
            <button onClick={newSession} className="btn btn-primary text-lg px-6 py-3">Nueva votación</button>
            <a href="/dashboard" className="btn btn-secondary text-lg px-6 py-3 text-center">Volver al dashboard</a>
          </div>
        </div>
      </main>
    );
  }

  if (session && session.status === "running" && current && current.status === "voting") {
    const a = current.item_a_id ? itemMap[current.item_a_id] : null;
    const b = current.item_b_id ? itemMap[current.item_b_id] : null;
    const total = current.votes_a + current.votes_b || 1;
    return (
      <main className="min-h-screen p-4 md:p-8 flex flex-col">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="text-2xl font-bold">{bracketName}</h2>
          <div className="flex gap-2 flex-wrap">
            <button onClick={togglePause} className="btn btn-secondary">{paused ? "Reanudar" : "Pausar"}</button>
            <button onClick={skip} className="btn btn-secondary">Saltar</button>
          </div>
        </div>
        {notice && <div className="text-center text-amber-300 text-2xl font-bold mb-2">{notice}</div>}
        <AnimatePresence mode="wait">
          <motion.div key={current.id} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.05, opacity: 0 }} className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {[{ it: a, v: current.votes_a }, { it: b, v: current.votes_b }].map((side, idx) => (
              <div key={idx} className="card p-4 md:p-8 flex flex-col items-center justify-center text-center gap-4">
                {side.it && <div className="relative w-40 h-40 md:w-64 md:h-64 rounded-xl overflow-hidden bg-slate-900"><Image src={side.it.image_url} alt={side.it.name} fill className="object-cover" unoptimized /></div>}
                <p className="text-3xl md:text-5xl font-extrabold">{side.it?.name || "—"}</p>
                <motion.p key={side.v} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="text-6xl md:text-7xl font-black text-amber-400">{side.v}</motion.p>
                <div className="w-full h-4 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${(side.v / total) * 100}%` }} /></div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="text-5xl font-mono font-bold text-cyan-300">{timeLeft}s</div>
          <div className="w-full max-w-xl h-3 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.min(100, (timeLeft / (session.duration_seconds || 1)) * 100)}%` }} /></div>
          <div className="text-slate-400">Votá en: <span className="text-white">{voteUrl}</span></div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="btn btn-secondary">← Dashboard</a>
          <h1 className="text-4xl font-extrabold">{bracketName || "Presentador"}</h1>
        </div>
        {session && <button onClick={newSession} className="btn btn-danger">Reiniciar sesión</button>}
      </div>

      {!session && (
        <div className="card p-5 mb-6 flex flex-col md:flex-row gap-4 items-end">
          <div><label>Segundos por enfrentamiento</label><input type="number" min={5} max={300} className="input mt-1 w-40" value={duration} onChange={e => setDuration(Math.max(5, Math.min(300, parseInt(e.target.value || "30", 10) || 30)))} /></div>
          <button onClick={doGenerate} className="btn btn-secondary">Generar llave</button>
          <button onClick={doGenerate} className="btn btn-secondary">Volver a mezclar</button>
          {nodes.length > 0 && <button onClick={createSession} className="btn btn-primary">Crear sala y mostrar QR</button>}
        </div>
      )}

      {session && session.status === "waiting" && (
        <div className="card p-6 mb-6 flex flex-col md:flex-row items-center gap-8">
          <div className="bg-white p-3 rounded-xl">{voteUrl && <QRCodeSVG value={voteUrl} size={220} />}</div>
          <div>
            <p className="text-xl mb-2">Escaneá para votar</p>
            <p className="text-amber-300 break-all text-lg font-mono">{voteUrl}</p>
            <button onClick={start} className="btn btn-primary text-xl mt-4 px-8 py-3">Iniciar</button>
          </div>
        </div>
      )}

      {session && session.status === "running" && !current && (
        <div className="card p-6 mb-6 text-center">
          <p className="text-2xl mb-3">Preparando siguiente enfrentamiento…</p>
          {notice && <p className="text-amber-300 text-xl mb-3">{notice}</p>}
          <button onClick={async () => { await loadDbMatches(session.id); await refreshSession(session.id); }} className="btn btn-secondary">Actualizar</button>
        </div>
      )}

      <div className="overflow-auto">
        <div className="flex gap-6 min-w-max pb-4">
          {(dbMatches.length ? roundNums : Array.from(new Set(nodes.map(n => n.round))).sort((a, b) => a - b)).map(r => {
            const ms: DisplayMatch[] = dbMatches.length ? (rounds[r] || []) : nodes.filter(n => n.round === r).map((n) => ({
              id: `p-${r}-${n.slot}`, session_id: "", round: n.round, slot: n.slot,
              item_a_id: n.itemA?.id || null, item_b_id: n.itemB?.id || null,
              winner_id: n.winnerId, votes_a: 0, votes_b: 0, status: n.status,
              voting_ends_at: null, next_match_id: null, next_slot: null,
              itemA: n.itemA, itemB: n.itemB,
            } as DisplayMatch));
            return (
              <div key={r} className="flex flex-col gap-4 min-w-[220px]">
                <h3 className="text-lg font-bold text-slate-300">Ronda {r}</h3>
                {ms.map((m) => {
                  const aName = m.item_a_id ? itemMap[m.item_a_id]?.name : (m.itemA?.name ?? "—");
                  const bName = m.item_b_id ? itemMap[m.item_b_id]?.name : (m.itemB?.name ?? (m.item_a_id ? "Pasa directo" : "—"));
                  const done = m.status === "done";
                  const win = m.winner_id;
                  const aId = m.item_a_id; const bId = m.item_b_id;
                  const isBye = m.item_a_id && !m.item_b_id;
                  return (
                    <div key={m.id} className={`card p-3 text-sm ${m.status === "voting" ? "ring-2 ring-amber-400" : ""}`}>
                      <div className={`p-1 rounded ${win && win === aId ? "bg-emerald-700/60 font-bold" : ""}`}>{aName || "—"} {m.votes_a != null ? `(${m.votes_a})` : ""}</div>
                      <div className="text-slate-500 text-xs my-1">vs</div>
                      <div className={`p-1 rounded ${win && win === bId ? "bg-emerald-700/60 font-bold" : ""}`}>{isBye ? "Pasa directo" : (bName || "—")} {bId ? `(${m.votes_b})` : ""}</div>
                      {done && !aId && !bId ? <div className="text-xs text-slate-500 mt-1">—</div> : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
