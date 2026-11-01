import { describe, expect, it } from "vitest";
import { categoryMismatches } from "../src/heuristics/categoryMismatch.js";
import { possibleDuplicates } from "../src/heuristics/possibleDuplicate.js";
import { ds, rec } from "./helpers.js";

describe("possible_duplicate", () => {
  it("matches 6205-ZZ vs '6205 zz' across systems, one candidate per row", () => {
    const cs = possibleDuplicates(ds([
      rec({ item_id: "1", source_system: "ERP-A" }),
      rec({ item_id: "2", source_system: "ERP-B", manufacturer_part_number: "6205 zz", item_description: "SKF bearing 6205 ZZ" }),
    ]));
    expect(cs.map((c) => [c.row_index, c.evidence.related_item_ids])).toEqual([[0, ["2"]], [1, ["1"]]]);
    expect(cs[0]).toMatchObject({ source: "heuristic", severity: "medium", confidence: 0.9 });
  });
  it("lower confidence when descriptions differ", () => {
    const [c] = possibleDuplicates(ds([rec(), rec({ item_id: "2", item_description: "Deep groove ball unit sealed" })]));
    expect(c!.confidence).toBe(0.8);
  });
  it("different manufacturer with same MPN is not a duplicate", () => {
    expect(possibleDuplicates(ds([rec(), rec({ item_id: "2", manufacturer: "FAG" })]))).toEqual([]);
  });
  it("blank MPNs never match each other on MPN; weak description match is low confidence", () => {
    const cs = possibleDuplicates(ds([
      rec({ manufacturer_part_number: "", item_description: "SKF deep groove bearing" }),
      rec({ item_id: "2", manufacturer_part_number: null, item_description: "SKF deep groove bearing" }),
    ]));
    expect(cs).toHaveLength(2);
    expect(cs[0]).toMatchObject({ severity: "low", confidence: 0.55 });
    expect(cs[0]!.evidence.score_breakdown).toMatchObject({ match_basis: "manufacturer_and_description" });
  });
  it("blank MPN with dissimilar descriptions: nothing (spec rows 1001/1002)", () => {
    expect(possibleDuplicates(ds([rec({ manufacturer_part_number: "", item_description: "bearing" }), rec({ item_id: "2" })]))).toEqual([]);
  });
  it("three-way group yields ONE candidate per row listing the other two", () => {
    const cs = possibleDuplicates(ds([rec(), rec({ item_id: "2" }), rec({ item_id: "3" })]));
    expect(cs).toHaveLength(3);
    expect(cs[0]!.evidence.related_item_ids).toEqual(["2", "3"]);
    expect(cs[0]!.evidence.score_breakdown).toMatchObject({ matching_records: 2 });
  });
  it("which matches are shown when capped does not depend on row order", () => {
    const rows = Array.from({ length: 15 }, (_, i) => rec({ item_id: String(100 + i) }));
    const shown = (rs: ReturnType<typeof rec>[]) => possibleDuplicates(ds(rs)).find((c) => c.item_id === "100")!.evidence.related_item_ids;
    expect(shown(rows)).toEqual(shown([...rows].reverse()));
  });
  it("large group: one candidate per row, related list capped at 10, true total reported, stable ids", () => {
    const rows = Array.from({ length: 30 }, (_, i) => rec({ item_id: String(i) }));
    const cs = possibleDuplicates(ds(rows));
    expect(cs).toHaveLength(30);
    expect(cs[0]!.evidence.related_item_ids).toHaveLength(10);
    expect(cs[0]!.evidence.score_breakdown).toMatchObject({ matching_records: 29 });
    expect(cs[0]!.explanation).toContain("and 19 more");
    expect(possibleDuplicates(ds(rows)).map((c) => c.candidate_id)).toEqual(cs.map((c) => c.candidate_id));
  });
  it("row in both a strong and a weak relationship gets one candidate for each basis", () => {
    const cs = possibleDuplicates(ds([
      rec({ item_id: "1" }),
      rec({ item_id: "2" }),
      rec({ item_id: "3", manufacturer_part_number: "" }),
    ]));
    expect(cs.filter((c) => c.row_index === 0).map((c) => (c.evidence.score_breakdown as { match_basis: string }).match_basis).sort())
      .toEqual(["manufacturer_and_description", "manufacturer_and_part_number"]);
  });
  it("manufacturer variants match when the part number matches (SKF vs SKF India, Schneider Electric vs SCHNEIDER)", () => {
    expect(possibleDuplicates(ds([rec({ item_id: "1" }), rec({ item_id: "2", manufacturer: "SKF India" })]))).toHaveLength(2);
    expect(possibleDuplicates(ds([
      rec({ item_id: "1", manufacturer: "Schneider Electric", manufacturer_part_number: "LC1D32P7" }),
      rec({ item_id: "2", manufacturer: "SCHNEIDER", manufacturer_part_number: "LC1D32P7" }),
    ]))).toHaveLength(2);
  });
  it("same item_id in the same source is left to duplicate_item_id", () => {
    expect(possibleDuplicates(ds([rec(), rec()]))).toEqual([]);
    expect(possibleDuplicates(ds([rec(), rec({ source_system: "ERP-B" })]))).toHaveLength(2); // different source: still a duplicate candidate
  });
  it("'M10 x 50' vs 'M10x50' counts as the same description", () => {
    const [c] = possibleDuplicates(ds([rec({ item_description: "Hex bolt M10 x 50" }), rec({ item_id: "2", item_description: "Hex bolt M10x50" })]));
    expect(c!.confidence).toBe(0.9);
  });
  it("a row never matches itself", () => expect(possibleDuplicates(ds([rec()]))).toEqual([]));
});

describe("category_mismatch_candidate", () => {
  it("flags bearing described under Electrical", () => {
    const [c] = categoryMismatches(ds([rec({ category: "Electrical" })]));
    expect(c).toMatchObject({ issue_type: "category_mismatch_candidate", severity: "low", confidence: 0.7, source: "heuristic" });
    expect(c!.evidence.score_breakdown).toEqual({ keyword_hits: ["bearing"], expected_category: "Mechanical", record_category_group: "Electrical" });
  });
  it("more keyword hits raise confidence", () => {
    const [c] = categoryMismatches(ds([rec({ category: "Electrical", item_description: "Steel bearing and gasket kit" })]));
    expect(c!.confidence).toBe(0.75);
  });
  it("no finding when category matches (case-insensitive), is blank, or description is ambiguous/unknown", () => {
    expect(categoryMismatches(ds([
      rec({ category: "mechanical" }),
      rec({ category: "" }),
      rec({ category: "Electrical", item_description: "bearing and relay assembly" }),
      rec({ category: "Electrical", item_description: "Widget" }),
    ]))).toEqual([]);
  });
  it.each([["Fasteners", "Hex bolt M8x40"], ["Seals & Gaskets", "Nitrile gasket 80 mm"], ["Piping", "SS316 flange 4 inch"]])(
    "specific mechanical label %j is not a mismatch for %j", (cat, d) => expect(categoryMismatches(ds([rec({ category: cat, item_description: d })]))).toEqual([]));
  it.each(["PPE", "Lubricants", "Automotive", "Pumps2"])("category label %j is unknown to the config, so it is never judged", (cat) =>
    expect(categoryMismatches(ds([rec({ category: cat, item_description: "SKF Bearing 6205 ZZ" })]))).toEqual([]));
  it.each([["Fasteners", "Thermal overload relay 9-13A"], ["Electrical", "PVC PIPE 2 INCH CLASS 10"], ["Mechanical", "Copper cable 4 sq mm"]])(
    "known label %j contradicts %j", (cat, d) => expect(categoryMismatches(ds([rec({ category: cat, item_description: d })]))).toHaveLength(1));
  it("matches plurals", () => expect(categoryMismatches(ds([rec({ category: "Electrical", item_description: "ball bearings" })]))).toHaveLength(1));
});
