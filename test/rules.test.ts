import { describe, expect, it } from "vitest";
import { duplicateItemId } from "../src/rules/duplicateItemId.js";
import { malformedRow } from "../src/rules/malformedRow.js";
import { missingPartNumber } from "../src/rules/missingPartNumber.js";
import { DETERMINISTIC_RULES } from "../src/rules/index.js";
import { unsupportedUom } from "../src/rules/unsupportedUom.js";
import { weakDescription } from "../src/rules/weakDescription.js";
import { ds, rec, types } from "./helpers.js";

describe("missing_part_number", () => {
  it.each([[""], ["   "], [null], ["N/A"]])("flags manufacturer present + MPN %j", (mpn) => {
    const [c] = missingPartNumber.run(ds([rec({ manufacturer_part_number: mpn })]));
    expect(c).toMatchObject({ issue_type: "missing_part_number", severity: "medium", confidence: 0.95, source: "deterministic_rule", review_status: "needs_review" });
    expect(c!.explanation).toContain("SKF");
  });
  it("does not flag when manufacturer is blank or MPN present", () => {
    expect(missingPartNumber.run(ds([rec({ manufacturer: "  ", manufacturer_part_number: "" }), rec({ manufacturer: null, manufacturer_part_number: null }), rec()]))).toEqual([]);
  });
});

describe("malformed_row", () => {
  it("reports each bad row by index, with whatever id is available", () => {
    const cs = malformedRow.run(ds([rec(), null, rec({ item_description: "" })]));
    expect(cs.map((c) => [c.row_index, c.item_id, c.severity])).toEqual([[1, null, "high"], [2, "1", "high"]]);
  });
});

describe("duplicate_item_id", () => {
  it("flags both rows for same id in same source (trim/case-insensitive)", () => {
    const cs = duplicateItemId.run(ds([rec({ item_id: "A1" }), rec({ item_id: " a1 " })]));
    expect(cs.map((c) => c.row_index)).toEqual([0, 1]);
    expect(cs[0]!.evidence.related_row_indexes).toEqual([1]);
  });
  it("does not flag same id in different source systems", () => {
    expect(duplicateItemId.run(ds([rec({ source_system: "ERP-A" }), rec({ source_system: "ERP-B" })]))).toEqual([]);
  });
  it("groups of three produce three candidates with distinct ids", () => {
    const cs = duplicateItemId.run(ds([rec(), rec(), rec()]));
    expect(new Set(cs.map((c) => c.candidate_id)).size).toBe(3);
  });
});

describe("unit of measure", () => {
  it.each([["EA"], [" ea "], ["Each"]])("accepts %j", (u) => expect(unsupportedUom.run(ds([rec({ unit_of_measure: u })]))).toEqual([]));
  it.each([["LTR"], ["MTR"], ["MTRS"]])("accepts the abbreviation %j of a supported unit", (u) => expect(unsupportedUom.run(ds([rec({ unit_of_measure: u })]))).toEqual([]));
  it.each([["CAN"], ["NOS"], ["KIT"]])("still flags %j (business to confirm)", (u) => expect(types(unsupportedUom.run(ds([rec({ unit_of_measure: u })])))).toEqual(["unsupported_unit_of_measure"]));
  it("flags unsupported", () => expect(types(unsupportedUom.run(ds([rec({ unit_of_measure: "XYZ" })])))).toEqual(["unsupported_unit_of_measure"]));
  it.each([[""], [null], ["  "]])("flags missing %j as low", (u) => {
    const [c] = unsupportedUom.run(ds([rec({ unit_of_measure: u })]));
    expect(c).toMatchObject({ issue_type: "missing_unit_of_measure", severity: "low" });
  });
});

describe("weak_description", () => {
  it.each([["bearing"], ["valve"], ["  Bearing  "], ["6205"], ["---"], ["the"], ["abc"], ["misc part"]])("flags %j", (d) =>
    expect(types(weakDescription.run(ds([rec({ item_description: d })])))).toEqual(["weak_description"]));
  it.each([["Filter cartridge"], ["Ball bearing"], ["Hex bolt"]])("flags %j: two words and no size, rating or part number", (d) =>
    expect(types(weakDescription.run(ds([rec({ item_description: d })])))).toEqual(["weak_description"]));
  it.each([["SKF Bearing 6205 ZZ"], ["Hex bolt M8x40"], ["bearing 6205"], ["Safety gloves nitrile coated size L"], ["Filter cartridge 10 micron"]])("accepts %j", (d) =>
    expect(weakDescription.run(ds([rec({ item_description: d })]))).toEqual([]));
});

describe("registry", () => {
  it("has unique ids", () => {
    const ids = DETERMINISTIC_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("valid record yields no findings", () => {
    expect(DETERMINISTIC_RULES.flatMap((r) => r.run(ds([rec()])))).toEqual([]);
  });
});
