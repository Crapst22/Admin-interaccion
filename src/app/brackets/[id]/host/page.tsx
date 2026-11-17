"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Item, Match, Session } from "@/types/db";
import { generateTurns, computeResults, type TurnMatch, type ClassificationResult } from "@/lib/bracket";
import { QRCodeSVG } from "qrcode.react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import StandingsTable from "@/components/StandingsTable";

function Bars({ high, medium, low }: { high: number; medium: number; low: number }) {
  const max = Math.max(1, high, medium, low);
  const rows = [
    { label: "Alta", value: high, color: "bg-red-500", text: "text-red-400" },
    { label: "Media", value: medium, color: "bg-orange-500", text: "text-orange-400" },
    { label: "Baja", value: low, color: "bg-yellow-400", text: "text-yellow-300" },
  ];
  return (
    <div className="w-full max-w-2xl space-y-4">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-3">
          <div className={`w-16 text-right font-bold ${r.text}`}>{r.label}</div>
          <div className="flex-1 h-10 bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
            <div className={`${r.color} h-full rounded-lg transition-all duration-300`} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <div className="w-10 text-left text-xl font-extrabold">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function HostPage() {
  const params = useParams<{ id: string }>();
  const bracketId = params.id;
  const supabase = useMemo(() => createClient(), []);
  const [bracketName, setBracketName] = useState("");
  const [bracketTitle, setBracketTitle] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [durationInput, setDurationInput] = useState("30");
  const [turns, setTurns] = useState<TurnMatch[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [dbMatches, setDbMatches] = useState<Match[]>([]);
  const [tick, setTick] = useState(Date.now());
  const [results, setResults] = useState<ClassificationResult[]>([]);
  const [paused, setPaused] = useState(false);
  const [localEnd, setLocalEnd] = useState<number | null>(null);
  const autoAdvancing = useRef(false);

  useEffect(() => { (async () => {
    const { data: b } = await supabase.from("brackets").select("id,name,title").eq("id", bracketId).single();
    if (b) { const bb = b as { name: string; title?: string }; setBracketName(bb.name); setBracketTitle(bb.title || ""); }
    const { data: its } = await supabase.from("items").select("*").eq("bracket_id", bracketId).order("position");
    setItems((its || []) as Item[]);
  })(); }, [bracketId, supabase]);

  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 250); return () => clearInterval(t); }, []);

  const siteUrl = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin) : "";
  const voteUrl = session ? `${siteUrl}/vote/${session.id}` : "";
  const itemMap = useMemo(() => { const m: Record<string, Item> = {}; items.forEach(i => { m[i.id] = i; }); return m; }, [items]);

  function prepareTurns() {
    if (items.length < 1) { alert("Agregá al menos 1 elemento"); return; }
    setTurns(generateTurns(items.map(i => ({ id: i.id, name: i.name, image_url: i.image_url }))));
  }

  async function createSession() {
    if (turns.length === 0) return;
    const parsed = parseInt(durationInput, 10);
    const safeDuration = Math.max(5, Math.min(300, Number.isFinite(parsed) ? parsed : 30));
    const payload = turns.map(t => ({ slot: t.slot, item_id: t.item_id }));
    const res = await fetch("/api/sessions/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bracket_id: bracketId, duration_seconds: safeDuration, matches: payload }) });
    const j = await res.json();
    if (!res.ok) { alert(j.error || "Error"); return; }
    setSession(j.session as Session); await loadDbMatches((j.session as Session).id);
  }

  const loadDbMatches = useCallback(async (sessionId: string) => {
    const { data } = await supabase.from("matches").select("*").eq("session_id", sessionId).order("slot");
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
  useEffect(() => {
    if (current?.status === "voting") setLocalEnd(Date.now() + (session?.duration_seconds || 30) * 1000);
    else setLocalEnd(null);
  }, [current?.id, current?.status, session?.duration_seconds]);
  const timeLeft = localEnd ? Math.max(0, Math.ceil((localEnd - tick) / 1000)) : (current?.status === "voting" ? (session?.duration_seconds || 30) : 0);

  useEffect(() => {
    if (!session || !current || current.status !== "voting" || paused) return;
    if (timeLeft <= 0 && !autoAdvancing.current) {
      autoAdvancing.current = true;
      const sid = session.id; const mid = current.id;
      (async () => {
        await fetch(`/api/sessions/${sid}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: mid }) });
        await loadDbMatches(sid); await refreshSession(sid);
        setTimeout(() => { autoAdvancing.current = false; }, 1500);
      })();
    }
  }, [timeLeft, current, paused, session, loadDbMatches, refreshSession]);
  useEffect(() => { if (current?.status === "voting") autoAdvancing.current = false; }, [current?.id, current?.status]);

  useEffect(() => {
    if (session?.status === "finished" && dbMatches.length) {
      setResults(computeResults(items.map(i => ({ id: i.id, name: i.name, image_url: i.image_url })), dbMatches));
    }
  }, [session?.status, dbMatches, items]);

  async function start() { if (!session) return; await fetch(`/api/sessions/${session.id}/start`, { method: "POST" }); await loadDbMatches(session.id); await refreshSession(session.id); }
  async function skip() { if (!session) return; await fetch(`/api/sessions/${session.id}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ match_id: session.current_match_id }) }); await loadDbMatches(session.id); await refreshSession(session.id); }
  async function togglePause() { if (!session) return; const action = paused ? "resume" : "pause"; await fetch(`/api/sessions/${session.id}/pause`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); setPaused(!paused); }
  async function newSession() { if (!session) return; await fetch(`/api/sessions/${session.id}/reset`, { method: "POST" }); setSession(null); setDbMatches([]); setResults([]); setPaused(false); }

  if (!bracketName && !items.length) return <main className="min-h-screen flex items-center justify-center">Cargando...</main>;

  if (session?.status === "finished") {
    return (
      <main className="min-h-screen p-6 md:p-10 flex flex-col items-center gap-6">
        {bracketTitle && <h1 className="text-4xl md:text-5xl font-extrabold text-center text-amber-300">{bracketTitle}</h1>}
        <StandingsTable results={results} />
        <div className="flex gap-3 flex-wrap justify-center">
          <button onClick={newSession} className="btn btn-primary text-lg px-6 py-3">Nueva votación</button>
          <a href="/dashboard" className="btn btn-secondary text-lg px-6 py-3 text-center">Volver al dashboard</a>
        </div>
      </main>
    );
  }

  if (session && session.status === "running" && current && current.status === "voting") {
    const it = current.item_id ? itemMap[current.item_id] : null;
    const pct = Math.min(100, (timeLeft / (session.duration_seconds || 1)) * 100);
    return (
      <main className="min-h-screen p-4 md:p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3"><a href="/dashboard" className="btn btn-secondary">← Dashboard</a></div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={togglePause} className="btn btn-secondary">{paused ? "Reanudar" : "Pausar"}</button>
            <button onClick={skip} className="btn btn-secondary">Saltar</button>
          </div>
        </div>
        {bracketTitle && <h1 className="text-2xl md:text-4xl font-extrabold text-center text-amber-300">{bracketTitle}</h1>}
        <div className="w-full max-w-3xl mx-auto flex flex-col items-center gap-1">
          <div className="text-3xl md:text-4xl font-mono font-bold text-cyan-300">{timeLeft}s</div>
          <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={current.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col md:flex-row items-center justify-center gap-6 min-h-0">
            {it && (
              <div className="card p-4 flex flex-col items-center gap-3 w-full md:w-1/2 max-w-xl">
                <div className="relative w-full aspect-[1600/836] rounded-xl overflow-hidden bg-slate-900">
                  <Image src={it.image_url} alt={it.name} fill className="object-contain" unoptimized />
                </div>
                <p className="text-2xl md:text-4xl font-extrabold text-center">{it.name}</p>
              </div>
            )}
            <div className="w-full md:w-1/2 max-w-xl flex items-center justify-center">
              <Bars high={current.votes_high || 0} medium={current.votes_medium || 0} low={current.votes_low || 0} />
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="text-center text-slate-400 text-sm md:text-base">Votá en: <span className="text-white break-all">{voteUrl}</span></div>
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
      {bracketTitle && <p className="text-xl text-amber-300 mb-4 font-semibold">{bracketTitle}</p>}

      {!session && (
        <div className="card p-5 mb-6 flex flex-col md:flex-row gap-4 items-end flex-wrap">
          <div><label>Segundos por turno</label><input type="number" min={5} max={300} placeholder="30" className="input mt-1 w-40" value={durationInput} onChange={e => setDurationInput(e.target.value)} /></div>
          <button onClick={prepareTurns} className="btn btn-secondary">Preparar turnos</button>
          {turns.length > 0 && <button onClick={createSession} className="btn btn-primary">Crear sala y mostrar QR</button>}
          {items.length < 1 && <span className="text-rose-400">Agregá al menos 1 elemento</span>}
        </div>
      )}

      {session && session.status === "waiting" && (
        <div className="card p-6 mb-6 flex flex-col md:flex-row items-center gap-8">
          <div className="bg-white p-4 rounded-xl">{voteUrl && <QRCodeSVG value={voteUrl} size={330} />}</div>
          <div>
            <p className="text-xl mb-2">Escaneá para votar</p>
            <p className="text-amber-300 break-all text-lg font-mono">{voteUrl}</p>
            <button onClick={start} className="btn btn-primary text-xl mt-4 px-8 py-3">Iniciar</button>
          </div>
        </div>
      )}

      {session && session.status === "running" && !current && (
        <div className="card p-6 mb-6 text-center">
          <p className="text-2xl mb-3">Preparando siguiente turno...</p>
          <button onClick={async () => { await loadDbMatches(session.id); await refreshSession(session.id); }} className="btn btn-secondary">Actualizar</button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(dbMatches.length ? dbMatches : turns).map((t, idx) => {
          const itId = "item_id" in t ? t.item_id : (t as TurnMatch).item_id;
          const it = itId ? itemMap[itId] : null;
          const status = "status" in t ? t.status : "pending";
          const active = status === "voting";
          return (
            <div key={idx} className={`card p-3 flex items-center gap-3 ${active ? "ring-2 ring-amber-400" : ""}`}>
              <div className="relative w-14 h-14 rounded overflow-hidden bg-slate-800 shrink-0">
                {it?.image_url && <Image src={it.image_url} alt="" fill className="object-contain" unoptimized />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{it?.name || "—"}</p>
                <p className="text-xs text-slate-400">{status === "done" ? "Listo" : status === "voting" ? "Votando" : "Pendiente"}</p>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
