export type BracketItem = { id: string; name: string; image_url?: string };

export type BracketMatch = {
  round: number;
  slot: number;
  item_a_id: string | null;
  item_b_id: string | null;
  winner_id: string | null;
  votes_a: number;
  votes_b: number;
  status: "pending" | "voting" | "done";
  is_bye: boolean;
  tie_broken: boolean;
  next_index: number | null; // índice en el array plano (null para la final)
  next_slot: "a" | "b" | null;
};

export type Standing = {
  item_id: string;
  name: string;
  image_url: string;
  total_votes: number;
  round_reached: number; // 1 = eliminado en ronda 1, ..., rounds = finalista, rounds+1 = campeón
  matches_played: number; // enfrentamientos reales (sin byes)
  position: number;
  label: string; // "Campeón", "Final", "Semifinal", etc.
};

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function bitReverse(x: number, bits: number): number {
  let y = 0;
  for (let i = 0; i < bits; i++) {
    y = (y << 1) | (x & 1);
    x >>= 1;
  }
  return y;
}

export function bitReverseOrder(slots: number): number[] {
  const bits = Math.round(Math.log2(slots));
  const out: number[] = [];
  for (let i = 0; i < slots; i++) out.push(bitReverse(i, bits));
  return out;
}

export function generateBracket(items: BracketItem[], rng: () => number = Math.random): BracketMatch[] {
  const n = items.length;
  if (n < 2) throw new Error("Se necesitan al menos 2 elementos");
  const shuffled = shuffle(items, rng);
  const size = 1 << Math.ceil(Math.log2(n));
  const rounds = Math.log2(size);
  const byes = size - n;
  const r1Count = size / 2;

  // crear todos los matches de todas las rondas
  const matches: BracketMatch[] = [];
  const roundStart: number[] = [];
  for (let r = 1; r <= rounds; r++) {
    roundStart[r] = matches.length;
    const count = size / Math.pow(2, r);
    for (let s = 0; s < count; s++) {
      matches.push({
        round: r,
        slot: s,
        item_a_id: null,
        item_b_id: null,
        winner_id: null,
        votes_a: 0,
        votes_b: 0,
        status: "pending",
        is_bye: false,
        tie_broken: false,
        next_index: null,
        next_slot: null,
      });
    }
  }
  // enlazar next
  for (let r = 1; r < rounds; r++) {
    const count = size / Math.pow(2, r);
    for (let s = 0; s < count; s++) {
      const idx = roundStart[r] + s;
      const nextIdx = roundStart[r + 1] + Math.floor(s / 2);
      matches[idx].next_index = nextIdx;
      matches[idx].next_slot = s % 2 === 0 ? "a" : "b";
    }
  }

  // elegir slots de ronda 1 que serán bye según bit-reversal
  const order = bitReverseOrder(r1Count);
  const byeSlots = new Set(order.slice(0, byes));

  // asignar participantes a ronda 1
  let p = 0;
  for (let s = 0; s < r1Count; s++) {
    const m = matches[roundStart[1] + s];
    if (byeSlots.has(s)) {
      // un solo participante (el otro vacío). Alternamos lado para variedad pero no es requerido;
      // colocamos en 'a' y dejamos 'b' null.
      m.item_a_id = shuffled[p++].id;
      m.item_b_id = null;
      m.is_bye = true;
      m.status = "done";
      m.winner_id = m.item_a_id;
      m.votes_a = 0;
      m.votes_b = 0;
    } else {
      m.item_a_id = shuffled[p++].id;
      m.item_b_id = shuffled[p++].id;
    }
  }

  // propagar ganadores de byes a siguientes rondas
  propagateWinners(matches);
  return matches;
}

export function propagateWinners(matches: BracketMatch[]): void {
  // propaga desde rondas tempranas a tardías; varias pasadas por seguridad
  for (let pass = 0; pass < 32; pass++) {
    let changed = false;
    for (const m of matches) {
      if (m.status === "done" && m.winner_id && m.next_index !== null) {
        const next = matches[m.next_index];
        if (m.next_slot === "a" && next.item_a_id !== m.winner_id) {
          next.item_a_id = m.winner_id;
          changed = true;
        }
        if (m.next_slot === "b" && next.item_b_id !== m.winner_id) {
          next.item_b_id = m.winner_id;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

// Calcula tabla de posiciones. Criterio de orden centralizado aquí para poder cambiarlo fácil.
// Actualmente: 1) mayor round_reached (campeón > subcampeón > semis...), 2) mayor total_votes,
// 3) mayor % de votos obtenidos sobre total de sus matches; si empatan, comparten puesto.
// Para cambiar a "solo por votos totales", reemplazar el comparador por (b.total_votes - a.total_votes).
export function computeStandings(items: BracketItem[], matches: BracketMatch[]): Standing[] {
  const rounds = matches.length ? Math.max(...matches.map(m => m.round)) : 0;
  const stats = new Map<string, { total_votes: number; round_reached: number; matches_played: number; votes_for: number; votes_against: number }>();
  for (const it of items) {
    stats.set(it.id, { total_votes: 0, round_reached: 0, matches_played: 0, votes_for: 0, votes_against: 0 });
  }

  for (const m of matches) {
    // acumular votos solo si el item participó en ese match
    if (m.item_a_id && stats.has(m.item_a_id)) {
      const s = stats.get(m.item_a_id)!;
      s.total_votes += m.votes_a;
      s.votes_for += m.votes_a;
      s.votes_against += m.votes_b;
      if (!m.is_bye) s.matches_played += 1;
      s.round_reached = Math.max(s.round_reached, m.round);
    }
    if (m.item_b_id && stats.has(m.item_b_id)) {
      const s = stats.get(m.item_b_id)!;
      s.total_votes += m.votes_b;
      s.votes_for += m.votes_b;
      s.votes_against += m.votes_a;
      if (!m.is_bye) s.matches_played += 1;
      s.round_reached = Math.max(s.round_reached, m.round);
    }
  }

  // campeón = ganador de la final
  const finalMatch = matches.find(m => m.round === rounds);
  const championId = finalMatch?.winner_id || null;
  if (championId && stats.has(championId)) {
    stats.get(championId)!.round_reached = rounds + 1;
  }

  const rows = items.map(it => {
    const s = stats.get(it.id)!;
    const total = s.votes_for + s.votes_against;
    const pct = total > 0 ? s.votes_for / total : 0;
    return { ...it, image_url: it.image_url || "", ...s, pct };
  });

  rows.sort((a, b) => {
    if (b.round_reached !== a.round_reached) return b.round_reached - a.round_reached;
    if (b.total_votes !== a.total_votes) return b.total_votes - a.total_votes;
    if (b.pct !== a.pct) return b.pct - a.pct;
    return 0;
  });

  let pos = 0;
  let lastKey = "";
  const result: Standing[] = rows.map((r, i) => {
    const key = `${r.round_reached}|${r.total_votes}|${r.pct}`;
    if (key !== lastKey) { pos = i + 1; lastKey = key; }
    return {
      item_id: r.id,
      name: r.name,
      image_url: r.image_url || "",
      total_votes: r.total_votes,
      round_reached: r.round_reached,
      matches_played: r.matches_played,
      position: pos,
      label: roundLabel(r.round_reached, rounds),
    };
  });
  return result;
}

export function roundLabel(roundReached: number, totalRounds: number): string {
  if (roundReached >= totalRounds + 1) return "Campeón";
  const diff = totalRounds - roundReached; // 0 = perdió en final
  if (diff === 0) return "Final";
  if (diff === 1) return "Semifinal";
  if (diff === 2) return "Cuartos";
  if (diff === 3) return "Octavos";
  return `Ronda ${roundReached}`;
}

export function decideWinner(votesA: number, votesB: number, itemA: string, itemB: string, rng: () => number = Math.random): { winnerId: string; tieBroken: boolean } {
  if (votesA > votesB) return { winnerId: itemA, tieBroken: false };
  if (votesB > votesA) return { winnerId: itemB, tieBroken: false };
  return { winnerId: rng() < 0.5 ? itemA : itemB, tieBroken: true };
}
