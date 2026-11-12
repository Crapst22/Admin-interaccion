import { Item } from "@/types/db";

export type MatchNode = {
  round: number; slot: number;
  itemA: Item | null; itemB: Item | null;
  votesA: number; votesB: number;
  status: "pending" | "voting" | "done";
  winnerId: string | null; votingEndsAt: string | null;
  nextIndex: number | null; nextSlot: "a" | "b" | null;
};

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Genera llave eliminatoria con byes repartidos en la primera ronda
export function generateBracket(items: Item[]): MatchNode[] {
  const shuffled = shuffle(items);
  const n = shuffled.length;
  const size = 1 << Math.ceil(Math.log2(n));
  const byes = size - n;
  const pairs = size / 2;
  // marcar qué pares reciben bye (slot B) repartidos
  const byePair = new Set<number>();
  for (let b = 0; b < byes; b++) {
    // distribuir a lo largo de los pares
    const idx = Math.floor((b * pairs) / Math.max(byes, 1));
    // buscar hueco cercano si colisiona
    let p = idx;
    while (byePair.has(p % pairs)) p++;
    byePair.add(p % pairs);
  }
  const slots: (Item | null)[] = Array(size).fill(null);
  let it = 0;
  for (let p = 0; p < pairs; p++) {
    slots[p * 2] = shuffled[it++] || null;
    if (byePair.has(p)) slots[p * 2 + 1] = null; else slots[p * 2 + 1] = shuffled[it++] || null;
  }

  const rounds = Math.log2(size);
  const matches: MatchNode[] = [];
  for (let s = 0; s < pairs; s++) {
    matches.push({ round: 1, slot: s, itemA: slots[s * 2], itemB: slots[s * 2 + 1], votesA: 0, votesB: 0, status: "pending", winnerId: null, votingEndsAt: null, nextIndex: null, nextSlot: null });
  }
  let prevStart = 0; let prevCount = pairs;
  for (let r = 2; r <= rounds; r++) {
    const count = prevCount / 2; const start = matches.length;
    for (let s = 0; s < count; s++) {
      const mi = start + s;
      const aIdx = prevStart + s * 2; const bIdx = prevStart + s * 2 + 1;
      matches[aIdx].nextIndex = mi; matches[aIdx].nextSlot = "a";
      matches[bIdx].nextIndex = mi; matches[bIdx].nextSlot = "b";
      matches.push({ round: r, slot: s, itemA: null, itemB: null, votesA: 0, votesB: 0, status: "pending", winnerId: null, votingEndsAt: null, nextIndex: null, nextSlot: null });
    }
    prevStart = start; prevCount = count;
  }
  // resolver byes ronda 1 y propagar
  for (const m of matches.filter(x => x.round === 1)) {
    if (m.itemA && !m.itemB) { m.winnerId = m.itemA.id; m.status = "done"; }
    else if (!m.itemA && m.itemB) { m.winnerId = m.itemB.id; m.status = "done"; }
  }
  propagateWinners(matches);
  return matches;
}

export function propagateWinners(matches: MatchNode[]) {
  let changed = true;
  for (let guard = 0; guard < 20 && changed; guard++) {
    changed = false;
    for (const m of matches) {
      if (m.status === "done" && m.winnerId && m.nextIndex !== null) {
        const next = matches[m.nextIndex];
        const winnerItem = m.winnerId === m.itemA?.id ? m.itemA : m.itemB ?? m.itemA;
        if (m.nextSlot === "a" && next.itemA?.id !== m.winnerId) { next.itemA = winnerItem; changed = true; }
        if (m.nextSlot === "b" && next.itemB?.id !== m.winnerId) { next.itemB = winnerItem; changed = true; }
      }
    }
  }
}

