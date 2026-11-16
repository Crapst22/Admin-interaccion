export type ClassItem = { id: string; name: string; image_url?: string };
export type VoteChoice = "high" | "medium" | "low";

export type TurnMatch = {
  slot: number;
  item_id: string;
  votes_high: number;
  votes_medium: number;
  votes_low: number;
  status: "pending" | "voting" | "done";
};

export type ClassificationResult = {
  item_id: string;
  name: string;
  image_url: string;
  votes_high: number;
  votes_medium: number;
  votes_low: number;
  level: VoteChoice;
  level_votes: number;
  position: number;
};

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateTurns(items: ClassItem[], rng: () => number = Math.random): TurnMatch[] {
  if (items.length < 1) throw new Error("Se necesita al menos 1 elemento");
  return shuffle(items, rng).map((it, idx) => ({
    slot: idx,
    item_id: it.id,
    votes_high: 0,
    votes_medium: 0,
    votes_low: 0,
    status: "pending",
  }));
}

const levelRank: Record<VoteChoice, number> = { high: 3, medium: 2, low: 1 };

export function classifyCounts(vh: number, vm: number, vl: number): { level: VoteChoice; level_votes: number } {
  // ties in count resolved by higher severity
  const max = Math.max(vh, vm, vl);
  if (vh === max) return { level: "high", level_votes: vh };
  if (vm === max) return { level: "medium", level_votes: vm };
  return { level: "low", level_votes: vl };
}

export function computeResults(
  items: ClassItem[],
  matches: Array<{ item_id: string | null; votes_high?: number; votes_medium?: number; votes_low?: number }>
): ClassificationResult[] {
  const byId = new Map(items.map(i => [i.id, i]));
  const rows = matches
    .filter(m => m.item_id && byId.has(m.item_id))
    .map(m => {
      const it = byId.get(m.item_id!)!;
      const vh = m.votes_high || 0, vm = m.votes_medium || 0, vl = m.votes_low || 0;
      const c = classifyCounts(vh, vm, vl);
      return {
        item_id: it.id, name: it.name, image_url: it.image_url || "",
        votes_high: vh, votes_medium: vm, votes_low: vl,
        level: c.level, level_votes: c.level_votes, position: 0,
      };
    });
  rows.sort((a, b) => {
    if (levelRank[b.level] !== levelRank[a.level]) return levelRank[b.level] - levelRank[a.level];
    return b.level_votes - a.level_votes;
  });
  rows.forEach((r, i) => { r.position = i + 1; });
  return rows;
}

export function levelLabel(level: VoteChoice): string {
  return level === "high" ? "Alta" : level === "medium" ? "Media" : "Baja";
}
