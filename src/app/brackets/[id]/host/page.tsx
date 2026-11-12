"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Item, Match, Session } from "@/types/db";
import { generateBracket, computeStandings, BracketMatch, Standing } from "@/lib/bracket";
import { QRCodeSVG } from "qrcode.react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Confetti from "@/components/Confetti";
import StandingsTable from "@/components/StandingsTable";

export default function HostPage() {
  const params = useParams<{ id: string }>();
  const bracketId = params.id;
  const supabase = useMemo(() => createClient(), []);
  const [bracketName, setBracketName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [durationInput, setDurationInput] = useState("");
  const [nodes, setNodes] = useState<BracketMatch[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [dbMatches, setDbMatches] = useState<Match[]>([]);
  const [tick, setTick] = useState(Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [paused, setPaused] = useState(false);
  const [localEnd, setLocalEnd] = useState<number | null>(null);
  const autoAdvancing = useRef(false);

  useEffect(() => { (async () => {
    const { data: b } = await supabase.from("brackets").select("id,name").eq("id", bracketId).single();
    if (b) setBracketName((b as { name: string }).name);
    const { data: its } = await supabase.from("items").select("*").eq("bracket_id", bracketId).order("position");
    setItems((its || []) as Item[]);
  })(); }, [bracketId, supabase]);

  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 250); return () => clearInterval(t); }, []);

  const siteUrl = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin) : "";
  const voteUrl = session ? `${siteUrl}/vote/${session.id}` : "";

  function doGenerate() {
    if (items.length < 2) { alert("Agregá al menos 2 elementos"); return; }
    setNodes(generateBracket(items.map(i => ({ id: i.id, name: i.name, image_url: i.image_url }))));
  }

  async function createSession() {
    if (nodes.length === 0) return;
    if (items.length < 2) { alert("Agregá al menos 2 elementos"); return; }
    const payload = nodes.map(n => ({
      round: n.round, slot: n.slot, item_a_id: n.item_a_id, item_b_id: n.item_b_id,
      winner_id: n.winner_id, status: n.status, votes_a: n.votes_a, votes_b: n.votes_b,
      next_index: n.next_index, next_slot: n.next_slot, is_bye: n.is_bye, tie_broken: n.tie_broken,
    }));
    const parsed = parseInt(durationInput, 10);
    const safeDuration = Math.max(5, Math.min(300, Number.isFinite(parsed) ? parsed : 30));
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
  useEffect(() => {
    if (current?.status === "voting") setLocalEnd(Date.now() + (session?.duration_seconds || 30) * 1000);
    else setLocalEnd(null);
  }, [current?.id, current?.status, session?.duration_seconds]);
  const timeLeft = localEnd ? Math.max(0, Math.ceil((localEnd - tick) / 1000)) : 0;

  useEffect(() => {
    if (!session || !current || current.status !== "voting" || paused) return;
    if (timeLeft <= 0 && !autoAdvancing.current) {
      autoAdvancing.current = true;
      const sid = session.id; const mid = current.id;
      (async () => {
        const res = await fetch(`/api/sessions/${sid}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: mid }) });
        const j = await res.json().catch(() => ({}));
        await loadDbMatches(sid); await refreshSession(sid);
        if (j.tie_broken) setNotice("Empate, decidido al azar");
        setTimeout(() => { setNotice(null); autoAdvancing.current = false; }, 2500);
      })();
    }
  }, [timeLeft, current, paused, session, loadDbMatches, refreshSession]);

  useEffect(() => { if (current?.status === "voting") autoAdvancing.current = false; }, [current?.id, current?.status]);

  useEffect(() => {
    if (session?.status === "finished" && dbMatches.length) {
      const st = computeStandings(items.map(i => ({ id: i.id, name: i.name, image_url: i.image_url })), dbMatches as unknown as BracketMatch[]);
      setStandings(st);
    }
  }, [session?.status, dbMatches, items]);

  async function start() {
    if (!session) return;
    if (items.length < 2) { alert("Agregá al menos 2 elementos"); return; }
    await fetch(`/api/sessions/${session.id}/start`, { method: "POST" });
    await loadDbMatches(session.id); await refreshSession(session.id);
  }
  async function skip() { if (!session) return; await fetch(`/api/sessions/${session.id}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: session.current_match_id }) }); await loadDbMatches(session.id); await refreshSession(session.id); }
  async function togglePause() { if (!session) return; const action = paused ? "resume" : "pause"; await fetch(`/api/sessions/${session.id}/pause`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); setPaused(!paused); }
  async function newSession() { if (!session) return; await fetch(`/api/sessions/${session.id}/reset`, { method: "POST" }); setSession(null); setDbMatches([]); setStandings([]); setNotice(null); setPaused(false); }

  const rounds = useMemo(() => {
    const r: Record<number, Match[]> = {}; dbMatches.forEach(m => { (r[m.round] = r[m.round] || []).push(m); });
    Object.values(r).forEach(a => a.sort((x, y) => x.slot - y.slot)); return r;
  }, [dbMatches]);
  const previewRounds = useMemo(() => {
    const r: Record<number, BracketMatch[]> = {}; nodes.forEach(m => { (r[m.round] = r[m.round] || []).push(m); });
    Object.values(r).forEach(a => a.sort((x, y) => x.slot - y.slot)); return r;
  }, [nodes]);
  const roundNums = (dbMatches.length ? Object.keys(rounds) : Object.keys(previewRounds)).map(Number).sort((a, b) => a - b);

  const championId = session?.status === "finished" && roundNums.length ? (rounds[Math.max(...roundNums)]?.[0]?.winner_id ?? null) : null;
  const champion = championId ? itemMap[championId] : null;

  if (!bracketName && !items.length) return <main className="min-h-screen flex items-center justify-center">Cargando…</main>;

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
          <div className="flex items-center gap-3"><a href="/dashboard" className="btn btn-secondary">← Dashboard</a><h2 className="text-2xl font-bold">{bracketName}</h2></div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={togglePause} className="btn btn-secondary">{paused ? "Reanudar" : "Pausar"}</button>
            <button onClick={skip} className="btn btn-secondary">Saltar</button>
          </div>
        </div>
        {notice && <div className="text-center text-amber-300 text-2xl font-bold mb-2">{notice}</div>}
        <AnimatePresence mode="wait">
          <motion.div key={current.id} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.02, opacity: 0 }} className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {[{ it: a, v: current.votes_a }, { it: b, v: current.votes_b }].map((side, idx) => (
              <div key={idx} className="card p-4 md:p-8 flex flex-col items-center justify-center text-center gap-4">
                {side.it && <div className="relative w-40 h-40 md:w-64 md:h-64 rounded-xl overflow-hidden bg-slate-900"><Image src={side.it.image_url} alt={side.it.name} fill className="object-cover" unoptimized /></div>}
                <p className="text-3xl md:text-5xl font-extrabold">{side.it?.name || "—"}</p>
                <motion.p key={side.v} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="text-6xl md:text-7xl font-black text-amber-400">{side.v}</motion.p>
                <div className="w-full h-4 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${(side.v / total) * 100}%` }} /></div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="text-5xl font-mono font-bold text-cyan-300">{timeLeft}s</div>
          <div className="w-full max-w-xl h-3 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.min(100, (timeLeft / (session.duration_seconds || 1)) * 100)}%` }} /></div>
          <div className="text-slate-400">Votá en: <span className="text-white break-all">{voteUrl}</span></div>
        </div>
      </main>
    );
  }

  const renderMatchCard = (m: Match | BracketMatch) => {
    const aId = m.item_a_id; const bId = m.item_b_id;
    const aName = aId ? itemMap[aId]?.name : "—";
    const bName = bId ? itemMap[bId]?.name : (m.is_bye ? "Pasa directo" : "—");
    const win = m.winner_id;
    const active = m.status === "voting";
    return (
      <div key={`${m.round}-${m.slot}-${("id" in m && m.id) || "p"}`} className={`card p-3 text-sm ${active ? "ring-2 ring-amber-400" : ""} ${m.is_bye ? "border-dashed border-cyan-500/50 bg-cyan-950/20" : ""}`}>
        {m.is_bye && <div className="text-[10px] uppercase tracking-wider text-cyan-300 mb-1 font-bold">Pasa directo</div>}
        <div className={`p-1 rounded ${win && win === aId ? "bg-emerald-700/60 font-bold" : ""}`}>{aName} <span className="text-slate-400">({m.votes_a ?? 0})</span></div>
        <div className="text-slate-500 text-xs my-1">vs</div>
        <div className={`p-1 rounded ${win && win === bId ? "bg-emerald-700/60 font-bold" : ""}`}>{bName} {!m.is_bye && <span className="text-slate-400">({m.votes_b ?? 0})</span>}</div>
        {m.tie_broken && <div className="text-xs text-amber-300 mt-1">Empate, decidido al azar</div>}
      </div>
    );
  };

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
        <div className="card p-5 mb-6 flex flex-col md:flex-row gap-4 items-end flex-wrap">
          <div><label>Segundos por enfrentamiento</label><input type="number" min={5} max={300} placeholder="30" className="input mt-1 w-40" value={durationInput} onChange={e => setDurationInput(e.target.value)} /></div>
          <button onClick={doGenerate} className="btn btn-secondary">Generar llave</button>
          <button onClick={doGenerate} className="btn btn-secondary">Volver a mezclar</button>
          {nodes.length > 0 && <button onClick={createSession} className="btn btn-primary">Crear sala y mostrar QR</button>}
          {items.length < 2 && <span className="text-rose-400">Agregá al menos 2 elementos</span>}
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
        <div className="flex gap-6 min-w-max pb-4 items-start">
          {roundNums.map(r => {
            const ms = dbMatches.length ? (rounds[r] || []) : (previewRounds[r] || []);
            return (
              <div key={r} className="flex flex-col gap-4 min-w-[230px]">
                <h3 className="text-lg font-bold text-slate-300">Ronda {r}</h3>
                {ms.map((m) => renderMatchCard(m as Match | BracketMatch))}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
