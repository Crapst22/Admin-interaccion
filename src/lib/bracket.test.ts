import { describe, it, expect } from "vitest";
import { generateTurns, classifyCounts, computeResults } from "./bracket";

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, name: `R${i + 1}`, image_url: "" }));

describe("generateTurns", () => {
  it("crea un turno por elemento con conteos en cero", () => {
    const turns = generateTurns(items(5), () => 0.2);
    expect(turns.length).toBe(5);
    expect(new Set(turns.map(t => t.item_id)).size).toBe(5);
    turns.forEach((t, i) => { expect(t.slot).toBe(i); expect(t.status).toBe("pending"); expect(t.votes_high).toBe(0); expect(t.votes_medium).toBe(0); expect(t.votes_low).toBe(0); });
  });
});

describe("classifyCounts", () => {
  it("elige el nivel con más votos", () => {
    expect(classifyCounts(5, 2, 1).level).toBe("high");
    expect(classifyCounts(1, 4, 2).level).toBe("medium");
    expect(classifyCounts(1, 2, 6).level).toBe("low");
  });
  it("en empate de conteos prioriza mayor severidad", () => {
    expect(classifyCounts(3, 3, 1).level).toBe("high");
    expect(classifyCounts(1, 3, 3).level).toBe("medium");
    expect(classifyCounts(2, 2, 2).level).toBe("high");
  });
});

describe("computeResults", () => {
  it("ordena alta>media>baja y por votos del nivel en empates", () => {
    const its = items(4);
    const res = computeResults(its, [
      { item_id: "i1", votes_high: 1, votes_medium: 5, votes_low: 0 }, // medium 5
      { item_id: "i2", votes_high: 3, votes_medium: 0, votes_low: 0 }, // high 3
      { item_id: "i3", votes_high: 6, votes_medium: 1, votes_low: 0 }, // high 6
      { item_id: "i4", votes_high: 0, votes_medium: 0, votes_low: 4 }, // low 4
    ]);
    expect(res.map(r => r.item_id)).toEqual(["i3", "i2", "i1", "i4"]);
    expect(res[0].position).toBe(1);
  });
});