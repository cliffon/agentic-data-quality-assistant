import { describe, expect, it } from "vitest";
import { stubSuggester } from "../src/ai/stubSuggester.js";
import { analyze } from "../src/pipeline/analyze.js";
import type { ReviewCandidate } from "../src/domain/types.js";

// Small seeded PRNG so failures are reproducible.
const prng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;

function makeRows(n: number, seed: number) {
  const r = prng(seed);
  return Array.from({ length: n }, (_, i) => ({
    item_id: `ID${i}`, // unique, so keying by item_id is unambiguous
    item_description: pick(r, ["bearing", "SKF Bearing 6205 ZZ", "skf bearing 6205 zz", "Hex bolt M8x40", "brg  6205", "Resistor 10k ohm", "---", "Ceramic capacitor 100nF"]),
    manufacturer: pick(r, ["SKF", "skf ", "FAG", "", null, "N/A"]),
    manufacturer_part_number: pick(r, ["6205-ZZ", "6205 ZZ", "6306", "", null]),
    category: pick(r, ["Mechanical", "Electrical", "", null]),
    unit_of_measure: pick(r, ["EA", "Each", "XYZ", "", null, "pcs"]),
    source_system: pick(r, ["ERP-A", "ERP-B", null]),
  }));
}

// Row-position independent key: which item, which issue, related to which items.
const key = (c: ReviewCandidate) => `${c.item_id}|${c.issue_type}|${c.severity}|${c.confidence}|${(c.evidence.related_item_ids ?? []).slice().sort().join(",")}`;
const keys = (cs: ReviewCandidate[]) => cs.map(key).sort();

function shuffle<T>(xs: T[], r: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

describe("properties over 60 pseudo-random rows", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const rows = makeRows(60, seed);

    it(`seed ${seed}: row order does not change what is found (5 shuffles)`, async () => {
      const base = keys((await analyze(rows, stubSuggester)).candidates);
      expect(base.length).toBeGreaterThan(0);
      for (let s = 0; s < 5; s++) {
        const shuffled = shuffle(rows, prng(100 + s));
        expect(keys((await analyze(shuffled, stubSuggester)).candidates)).toEqual(base);
      }
    });

    it(`seed ${seed}: repeatable, input untouched, every candidate sane`, async () => {
      const before = structuredClone(rows);
      const a = await analyze(rows, stubSuggester);
      const b = await analyze(rows, stubSuggester);
      expect(a).toEqual(b);
      expect(rows).toEqual(before);
      const ids = new Set<string>();
      for (const c of a.candidates) {
        expect(c.confidence).toBeGreaterThanOrEqual(0);
        expect(c.confidence).toBeLessThanOrEqual(1);
        expect(c.explanation.length).toBeGreaterThan(10);
        expect(c.review_status).toBe("needs_review");
        expect(ids.has(c.candidate_id)).toBe(false);
        ids.add(c.candidate_id);
        if (c.source === "ai_assisted_simulated") expect(c.confidence).toBeLessThanOrEqual(0.6);
        if (c.issue_type === "possible_duplicate") {
          expect(c.evidence.related_item_ids!.length).toBeGreaterThanOrEqual(1);
          expect(c.evidence.related_item_ids!.length).toBeLessThanOrEqual(10);
          expect(c.evidence.related_item_ids).not.toContain(c.item_id);
        }
      }
    });
  }

  it("possible_duplicate groups are consistent: if A lists B (uncapped group) then B lists A, per basis", async () => {
    const { candidates } = await analyze(makeRows(80, 9));
    const edges = new Set<string>();
    for (const c of candidates.filter((x) => x.issue_type === "possible_duplicate")) {
      const sb = c.evidence.score_breakdown as { match_basis: string; matching_records: number };
      if (sb.matching_records > 10) continue; // list is capped, symmetry not checkable
      for (const o of c.evidence.related_item_ids!) edges.add(`${sb.match_basis}|${c.item_id}>${o}`);
    }
    expect(edges.size).toBeGreaterThan(0);
    for (const e of edges) {
      const [basis, pair] = e.split("|");
      const [a, b] = pair!.split(">");
      // B may exceed the cap even if A does not, only assert when B was also uncapped (present as a source)
      const bListed = [...edges].some((x) => x.startsWith(`${basis}|${b}>`));
      if (bListed) expect(edges.has(`${basis}|${b}>${a}`)).toBe(true);
    }
  });
});

describe("scale", () => {
  it("400 near-identical rows with no MPN finish quickly and do not flood the response", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({
      item_id: String(i), item_description: "SKF deep groove ball bearing", manufacturer: "SKF", manufacturer_part_number: "",
      category: "Mechanical", unit_of_measure: "EA", source_system: "ERP-A",
    }));
    const t = Date.now();
    const { candidates } = await analyze(rows);
    const ms = Date.now() - t;
    const perRow = new Map<number, number>();
    for (const c of candidates) perRow.set(c.row_index, (perRow.get(c.row_index) ?? 0) + 1);
    const worst = Math.max(...perRow.values());
    console.log(`scale: ${candidates.length} candidates, worst row has ${worst}, ${ms}ms`);
    expect(ms).toBeLessThan(5000);
    expect(worst).toBeLessThanOrEqual(5); // missing MPN + one grouped duplicate card, not hundreds
  });
});
