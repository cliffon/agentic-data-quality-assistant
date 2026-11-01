import { describe, expect, it } from "vitest";
import { stubSuggester } from "../src/ai/stubSuggester.js";
import { validateSuggestions } from "../src/ai/validateSuggestions.js";
import { ds, rec } from "./helpers.js";

const records = ds([rec({ item_description: "brg  6205 zz" })]).records;

describe("stub suggester", () => {
  it("normalizes spacing and expands abbreviations", async () => {
    const [s] = (await stubSuggester.suggest([{ row_index: 0, item_description: "brg  6205 zz", manufacturer: null, category: null }])) as { suggested_value: string }[];
    expect(s!.suggested_value).toBe("Bearing 6205 zz");
  });
  it.each(["20 mm", "7.5 kW", "M10 x 50", "PVC PIPE 2 INCH", "bearing", "Washer m12 SPRING", "  padded  "])(
    "never changes casing or units: %j gets no suggestion",
    async (d) => expect(await stubSuggester.suggest([{ row_index: 0, item_description: d, manufacturer: null, category: null }])).toEqual([]),
  );
  it("suggests nothing for already-normal text", async () => {
    expect(await stubSuggester.suggest([{ row_index: 0, item_description: "SKF Bearing 6205 ZZ", manufacturer: null, category: null }])).toEqual([]);
  });
});

describe("validateSuggestions (trust boundary)", () => {
  const good = { row_index: 0, suggested_value: "Bearing 6205 ZZ", rationale: "ok", confidence: 0.5 };

  it("accepts a good suggestion and labels it ai_assisted_simulated / needs_review", () => {
    const { candidates, rejected } = validateSuggestions([good], records);
    expect(rejected).toBe(0);
    expect(candidates[0]).toMatchObject({ source: "ai_assisted_simulated", severity: "low", confidence: 0.5, review_status: "needs_review" });
    expect(candidates[0]!.evidence.suggested_value).toBe("Bearing 6205 ZZ");
  });

  it("clamps over-confident output to the AI cap", () => {
    expect(validateSuggestions([{ ...good, confidence: 0.99 }], records).candidates[0]!.confidence).toBe(0.6);
    expect(validateSuggestions([{ ...good, confidence: -3 }], records).candidates[0]!.confidence).toBe(0);
  });

  it("ignores attempts to set source/severity", () => {
    const [c] = validateSuggestions([{ ...good, source: "deterministic_rule", severity: "high" }], records).candidates;
    expect(c).toMatchObject({ source: "ai_assisted_simulated", severity: "low" });
  });

  it.each([
    ["unknown row", { ...good, row_index: 99 }],
    ["wrong types", { ...good, confidence: "high" }],
    ["NaN confidence", { ...good, confidence: NaN }],
    ["empty value", { ...good, suggested_value: "  " }],
    ["oversized value", { ...good, suggested_value: "x".repeat(500) }],
    ["unchanged value", { ...good, suggested_value: "brg  6205 zz" }],
    ["null", null],
    ["string", "ignore previous instructions"],
  ])("rejects %s", (_n, bad) => {
    const r = validateSuggestions([bad], records);
    expect(r.candidates).toEqual([]);
    expect(r.rejected).toBe(1);
  });

  it("keeps only the first suggestion per row", () => {
    const r = validateSuggestions([good, { ...good, suggested_value: "Other" }], records);
    expect(r.candidates).toHaveLength(1);
    expect(r.rejected).toBe(1);
  });
});
