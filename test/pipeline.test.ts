import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Suggester } from "../src/ai/suggester.js";
import { stubSuggester } from "../src/ai/stubSuggester.js";
import { reviewCandidateSchema } from "../src/domain/schema.js";
import { analyze } from "../src/pipeline/analyze.js";
import { rec } from "./helpers.js";

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

describe("analyze", () => {
  it("golden: spec sample matches hand-written expectation", async () => {
    const { candidates } = await analyze(JSON.parse(fixture("sample-input.json")), stubSuggester);
    const projection = candidates.map(({ row_index, issue_type, severity, confidence, source }) => ({ row_index, issue_type, severity, confidence, source }));
    const expected = JSON.parse(fixture("sample-expected.json")) as typeof projection;
    // order within a row is severity then issue_type, so compare as sets keyed by row+type
    const key = (p: { row_index: number; issue_type: string }) => `${p.row_index}:${p.issue_type}`;
    expect(projection.map(key).sort()).toEqual(expected.map(key).sort());
    for (const e of expected) expect(projection).toContainEqual(e);
  });

  it("golden: demo fixture (all 9 issue types, 3 sources) matches hand-derived expectation exactly", async () => {
    const { candidates, summary } = await analyze(JSON.parse(fixture("demo-input.json")), stubSuggester);
    const got = candidates.map(({ row_index, issue_type, severity, confidence, source }) => ({ row_index, issue_type, severity, confidence, source }));
    const expected = JSON.parse(fixture("demo-expected.json")) as typeof got;
    const k = (p: (typeof got)[number]) => `${p.row_index}|${p.issue_type}`;
    expect(got.sort((a, b) => k(a).localeCompare(k(b)))).toEqual(expected.sort((a, b) => k(a).localeCompare(k(b))));
    expect(Object.keys(summary.by_issue_type).sort()).toEqual([
      "category_mismatch_candidate", "duplicate_item_id", "malformed_row", "missing_part_number", "missing_unit_of_measure",
      "normalized_description_suggestion", "possible_duplicate", "unsupported_unit_of_measure", "weak_description",
    ]);
  });

  it("golden: 50-row external dataset matches hand-derived expectation (see README for what each row shows)", async () => {
    const { candidates, warnings, summary } = await analyze(JSON.parse(fixture("external-input.json")), stubSuggester);
    const got = candidates.map(({ row_index, issue_type, severity, confidence, source }) => ({ row_index, issue_type, severity, confidence, source }));
    const expected = JSON.parse(fixture("external-expected.json")) as typeof got;
    const k = (p: (typeof got)[number]) => `${p.row_index}|${p.issue_type}`;
    expect(got.sort((a, b) => k(a).localeCompare(k(b)))).toEqual(expected.sort((a, b) => k(a).localeCompare(k(b))));
    expect(warnings).toEqual([]);
    expect(summary).toMatchObject({ total_rows: 50, total_candidates: 34, rows_with_candidates: 30 });
  });

  it("every candidate satisfies the output schema and uses review language", async () => {
    const rows = [rec({ manufacturer_part_number: "", item_description: "bearing", category: "Electrical", unit_of_measure: "XYZ" }), null, rec(), rec()];
    const { candidates } = await analyze(rows, stubSuggester);
    expect(candidates.length).toBeGreaterThan(5);
    for (const c of candidates) {
      expect(reviewCandidateSchema.safeParse(c).success).toBe(true);
      expect(JSON.stringify(c)).not.toMatch(/\b(fixed|corrected|auto-?approved)\b/i);
    }
  });

  it("does not mutate caller input (deep-equal) and survives frozen input", async () => {
    const rows = [rec({ manufacturer_part_number: "" }), rec({ item_id: "2" })];
    const before = structuredClone(rows);
    Object.freeze(rows[0]);
    await analyze(rows, stubSuggester);
    expect(rows).toEqual(before);
    expect(Object.isFrozen(rows[1])).toBe(false);
  });

  it("empty input gives zero candidates and zeroed summary", async () => {
    const r = await analyze([], stubSuggester);
    expect(r.candidates).toEqual([]);
    expect(r.summary).toMatchObject({ total_rows: 0, rows_with_candidates: 0, total_candidates: 0 });
  });

  it("valid record: no candidates", async () => {
    expect((await analyze([rec()])).candidates).toEqual([]);
  });

  it("multiple findings on one record, sorted by severity within the row", async () => {
    const { candidates } = await analyze([rec({ manufacturer_part_number: "", unit_of_measure: "XYZ", item_description: "bearing", category: "Electrical" })]);
    expect(candidates.map((c) => c.issue_type)).toEqual(["missing_part_number", "unsupported_unit_of_measure", "weak_description", "category_mismatch_candidate"]);
    expect(new Set(candidates.map((c) => c.candidate_id)).size).toBe(candidates.length);
  });

  it("is deterministic across runs", async () => {
    const rows = JSON.parse(fixture("sample-input.json"));
    expect(await analyze(rows, stubSuggester)).toEqual(await analyze(rows, stubSuggester));
  });

  it("a failing suggester degrades to a warning", async () => {
    const boom: Suggester = { name: "boom", suggest: async () => { throw new Error("timeout"); } };
    const r = await analyze([rec({ manufacturer_part_number: "" })], boom);
    expect(r.candidates.map((c) => c.issue_type)).toEqual(["missing_part_number"]);
    expect(r.warnings[0]).toContain("timeout");
  });

  it("a hostile suggester is validated and discarded", async () => {
    const hostile: Suggester = {
      name: "hostile",
      suggest: async () => [{ row_index: 0, suggested_value: "x".repeat(999), rationale: "r", confidence: 1.5 }, { row_index: 7, suggested_value: "y", rationale: "r", confidence: 0.1 }, "drop table"],
    };
    const r = await analyze([rec()], hostile);
    expect(r.candidates).toEqual([]);
    expect(r.warnings[0]).toContain("3 AI suggestion");
  });

  it("summary counts line up with candidates", async () => {
    const r = await analyze([rec({ manufacturer_part_number: "" }), null], stubSuggester);
    const s = r.summary;
    expect(s.total_candidates).toBe(r.candidates.length);
    expect(Object.values(s.by_severity).reduce((a, b) => a + b)).toBe(r.candidates.length);
    expect(Object.values(s.by_source).reduce((a, b) => a + b)).toBe(r.candidates.length);
  });
});
