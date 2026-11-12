import { describe, it, expect } from "vitest";
import { generateBracket, computeStandings, decideWinner, BracketItem, BracketMatch } from "./bracket";

function makeItems(n: number): BracketItem[] {
  return Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, name: `Item ${i + 1}`, image_url: "" }));
}

function playMatch(m: BracketMatch, rng: () => number): BracketMatch {
  if (m.status === "done" || !m.item_a_id || !m.item_b_id) return m;
  const va = Math.floor(rng() * 20);
  const vb = Math.floor(rng() * 20);
  const { winnerId, tieBroken } = decideWinner(va, vb, m.item_a_id, m.item_b_id, rng);
  return { ...m, votes_a: va, votes_b: vb, winner_id: winnerId, tie_broken: tieBroken, status: "done" };
}

function propagate(ms: BracketMatch[]) {
  for (let pass = 0; pass < 32; pass++) {
    let changed = false;
    for (const m of ms) {
      if (m.status === "done" && m.winner_id && m.next_index !== null) {
        const next = ms[m.next_index];
        if (m.next_slot === "a" && next.item_a_id !== m.winner_id) { next.item_a_id = m.winner_id; changed = true; }
        if (m.next_slot === "b" && next.item_b_id !== m.winner_id) { next.item_b_id = m.winner_id; changed = true; }
      }
    }
    if (!changed) break;
  }
}

function simulate(items: BracketItem[], seed = 1) {
  let s = seed;
  const rng = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const ms = generateBracket(items, rng).map(m => ({ ...m }));
  propagate(ms);
  const rounds = Math.max(...ms.map(m => m.round));
  for (let r = 1; r <= rounds; r++) {
    for (const idx of ms.map((_, i) => i).filter(i => ms[i].round === r)) {
      ms[idx] = playMatch(ms[idx], rng);
    }
    propagate(ms);
  }
  return ms;
}

const NS = [2, 3, 4, 5, 6, 7, 8, 9, 13, 16, 20];

describe("generateBracket", () => {
  for (const n of NS) {
    it(`N=${n}: totales, reales, apariciones, byes y enlaces`, () => {
      const items = makeItems(n);
      const ms = generateBracket(items, () => 0.42);
      const size = 1 << Math.ceil(Math.log2(n));
      const byes = size - n;
      expect(ms.length).toBe(size - 1);
      expect(ms.filter(m => m.is_bye).length).toBe(byes);
      expect(ms.filter(m => !m.is_bye).length).toBe(n - 1);

      // cada item exactamente una vez en ronda 1
      const r1 = ms.filter(m => m.round === 1);
      const ids = r1.flatMap(m => [m.item_a_id, m.item_b_id]).filter((x): x is string => !!x);
      expect(ids.length).toBe(n);
      expect(new Set(ids).size).toBe(n);

      // ningún match con dos byes ni ambos vacíos
      for (const m of r1) {
        const filled = [m.item_a_id, m.item_b_id].filter(Boolean).length;
        expect(filled).toBeGreaterThanOrEqual(1);
        if (m.is_bye) expect(filled).toBe(1); else expect(filled).toBe(2);
      }

      // enlaces válidos y slots llenados una vez
      const rounds = Math.max(...ms.map(m => m.round));
      for (const m of ms) {
        if (m.round < rounds) {
          expect(m.next_index).not.toBeNull();
          expect(m.next_slot === "a" || m.next_slot === "b").toBe(true);
        } else {
          expect(m.next_index).toBeNull();
        }
      }
      // cada slot de ronda>1 se llena exactamente una vez (por enlace de ronda anterior o ya vacío? no, por enlaces/byes propagados)
      for (let r = 2; r <= rounds; r++) {
        for (const m of ms.filter(x => x.round === r)) {
          const incoming = ms.filter(x => x.next_index === ms.indexOf(m));
          expect(incoming.length).toBe(2);
          const hasA = incoming.some(x => x.next_slot === "a");
          const hasB = incoming.some(x => x.next_slot === "b");
          expect(hasA).toBe(true);
          expect(hasB).toBe(true);
        }
      }
      // byes resueltos y propagados
      for (const m of ms.filter(x => x.is_bye)) {
        expect(m.status).toBe("done");
        expect(m.winner_id).toBeTruthy();
        expect(m.votes_a).toBe(0);
        expect(m.votes_b).toBe(0);
      }
    });

    it(`N=${n}: simulación completa produce campeón único y standings válidos`, () => {
      const items = makeItems(n);
      const ms = simulate(items, n * 7 + 3);
      const rounds = Math.max(...ms.map(m => m.round));
      const final = ms.find(m => m.round === rounds)!;
      expect(final.winner_id).toBeTruthy();
      const winners = ms.filter(m => m.status === "done" && m.winner_id).length;
      expect(winners).toBe(ms.length);

      const st = computeStandings(items, ms);
      expect(st.length).toBe(n);
      expect(new Set(st.map(s => s.item_id)).size).toBe(n);
      expect(st[0].item_id).toBe(final.winner_id);
      expect(st[0].label).toBe("Campeón");
      expect(st[0].position).toBe(1);
    });
  }

  it("empate se resuelve (no se traba)", () => {
    const items = makeItems(4);
    const ms = generateBracket(items, () => 0.1).map(m => ({ ...m }));
    // forzar empate en todos los enfrentamientos reales
    for (let i = 0; i < ms.length; i++) {
      if (ms[i].is_bye) continue;
      ms[i] = { ...ms[i], votes_a: 5, votes_b: 5 };
      const { winnerId, tieBroken } = decideWinner(5, 5, ms[i].item_a_id!, ms[i].item_b_id!, () => 0.9);
      ms[i].winner_id = winnerId; ms[i].tie_broken = tieBroken; ms[i].status = "done";
      // propagar
      for (let pass = 0; pass < 10; pass++) for (const m of ms) {
        if (m.status === "done" && m.winner_id && m.next_index !== null) {
          const next = ms[m.next_index];
          if (m.next_slot === "a") next.item_a_id = m.winner_id; else if (m.next_slot === "b") next.item_b_id = m.winner_id;
        }
      }
    }
    expect(ms.every(m => m.status === "done" && m.winner_id)).toBe(true);
    expect(ms.filter(m => !m.is_bye).some(m => m.tie_broken)).toBe(true);
  });

  it("N < 2 lanza error", () => {
    expect(() => generateBracket(makeItems(1))).toThrow();
  });
});
