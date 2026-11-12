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

// Genera llave donde TODOS los cruces son enfrentamientos reales (2 participantes).
// Si hay cantidad impar en una ronda, un elemento queda fuera de esa ronda y
// se incorpora en la siguiente junto a los ganadores (sin "pasa directo").
export function generateBracket(items: Item[]): MatchNode[] {
  const shuffled = shuffle(items);
  // participantes por ronda como lista de Item (conocidos) o null (ganador pendiente)
  let participants: (Item | null)[] = [...shuffled];
  const roundsData: { a: Item | null; b: Item | null }[][] = [];

  while (participants.length > 1) {
    const matchCount = Math.floor(participants.length / 2);
    const round: { a: Item | null; b: Item | null }[] = [];
    for (let i = 0; i < matchCount; i++) {
      round.push({ a: participants[i * 2] ?? null, b: participants[i * 2 + 1] ?? null });
    }
    roundsData.push(round);
    const carry = participants.length % 2 === 1 ? participants[participants.length - 1] : null;
    // siguiente ronda: ganadores pendientes + carry (si existe, ya es conocido o null)
    const next: (Item | null)[] = new Array(matchCount).fill(null);
    if (carry !== null) next.push(carry);
    participants = next;
  }

  const matches: MatchNode[] = [];
  const roundStarts: number[] = [];
  for (let r = 0; r < roundsData.length; r++) {
    roundStarts[r] = matches.length;
    for (let s = 0; s < roundsData[r].length; s++) {
      matches.push({
        round: r + 1, slot: s,
        itemA: roundsData[r][s].a, itemB: roundsData[r][s].b,
        votesA: 0, votesB: 0, status: "pending", winnerId: null, votingEndsAt: null,
        nextIndex: null, nextSlot: null,
      });
    }
  }

  // enlazar ganadores a su posición en la siguiente ronda (considerando carry como slot extra)
  for (let r = 0; r < roundsData.length - 1; r++) {
    const matchCount = roundsData[r].length;
    const nextMatchCount = roundsData[r + 1].length;
    for (let i = 0; i < matchCount; i++) {
      const pos = i; // posición del ganador entre participantes de r+1
      const mIdx = roundStarts[r + 1] + Math.floor(pos / 2);
      if (mIdx < roundStarts[r + 1] + nextMatchCount) {
        matches[roundStarts[r] + i].nextIndex = mIdx;
        matches[roundStarts[r] + i].nextSlot = pos % 2 === 0 ? "a" : "b";
      }
    }
  }

  return matches;
}

export function propagateWinners(matches: MatchNode[]) {
  for (const m of matches) {
    if (m.status === "done" && m.winnerId && m.nextIndex !== null) {
      const next = matches[m.nextIndex];
      const winnerItem = m.winnerId === m.itemA?.id ? m.itemA : m.itemB ?? m.itemA;
      if (m.nextSlot === "a") next.itemA = winnerItem; else if (m.nextSlot === "b") next.itemB = winnerItem;
    }
  }
}
