import { describe, expect, it } from "vitest";
import { analyze } from "../src/pipeline/analyze.js";
import { rec } from "./helpers.js";

/**
 * Exhaustive combinations. Expectations come from the tiny oracles below, written from the
 * requirements (assignment checks 1,2,3,5), NOT by calling production helpers.
 */

const MFR = ["SKF", "  ", null, "N/A"] as const;
const MPN = ["6205-ZZ", "", null, "TBD"] as const;
const UOM = ["EA", "Each", "XYZ", ""] as const;
const DESC = ["SKF Bearing 6205 ZZ", "bearing", "---", "misc part"] as const;

const mfrPresent = (m: string | null) => m === "SKF";
const mpnBlank = (m: string | null) => m === "" || m === null || m === "TBD";

describe("single record: manufacturer x MPN x UoM x description (256 combos)", () => {
  for (const m of MFR) for (const p of MPN) for (const u of UOM) for (const d of DESC) {
    it(`mfr=${JSON.stringify(m)} mpn=${JSON.stringify(p)} uom=${JSON.stringify(u)} desc=${JSON.stringify(d)}`, async () => {
      const expected: string[] = [];
      if (mfrPresent(m) && mpnBlank(p)) expected.push("missing_part_number");
      if (d !== "SKF Bearing 6205 ZZ") expected.push("weak_description");
      if (u === "XYZ") expected.push("unsupported_unit_of_measure");
      if (u === "") expected.push("missing_unit_of_measure");

      const { candidates } = await analyze([rec({ manufacturer: m, manufacturer_part_number: p, unit_of_measure: u, item_description: d })]);
      expect(candidates.map((c) => c.issue_type).sort()).toEqual(expected.sort());
      for (const c of candidates) expect(c.review_status).toBe("needs_review");
    });
  }
});

describe("record pair: manufacturer x MPN x source x item_id x description (64 combos)", () => {
  const D1 = "SKF deep groove bearing 6205";
  const D2 = "Hex bolt M8x40 zinc";
  const mfrs = ["same", "different"] as const;
  const mpns = ["same-format", "variant-format", "different", "blank"] as const;
  const sources = ["same", "different"] as const;
  const ids = ["same", "different"] as const;
  const descs = ["same", "different"] as const;

  for (const mf of mfrs) for (const mp of mpns) for (const so of sources) for (const id of ids) for (const ds of descs) {
    it(`mfr:${mf} mpn:${mp} source:${so} id:${id} desc:${ds}`, async () => {
      const a = rec({ item_id: "A1", item_description: D1, manufacturer: "SKF", manufacturer_part_number: "6205-ZZ", source_system: "ERP-A" });
      const b = rec({
        item_id: id === "same" ? "A1" : "B2",
        item_description: ds === "same" ? D1 : D2,
        manufacturer: mf === "same" ? " skf " : "FAG",
        manufacturer_part_number: { "same-format": "6205-ZZ", "variant-format": "6205 zz", different: "6306", blank: "" }[mp],
        source_system: so === "same" ? "ERP-A" : "ERP-B",
        category: "Mechanical",
      });

      // oracle
      const sameMfr = mf === "same";
      const strong = sameMfr && (mp === "same-format" || mp === "variant-format");
      const weak = sameMfr && mp === "blank" && ds === "same"; // one MPN missing + identical description
      const expected: string[] = [];
      // Same id in the same source is reported once, as a key collision; no second duplicate card for it.
      if (so === "same" && id === "same") expected.push("duplicate_item_id");
      else if (strong || weak) expected.push("possible_duplicate");

      const { candidates } = await analyze([a, b]);
      const only = (row: number) => candidates.filter((c) => c.row_index === row && ["duplicate_item_id", "possible_duplicate"].includes(c.issue_type));

      for (const row of [0, 1]) expect(only(row).map((c) => c.issue_type).sort()).toEqual(expected.sort());

      const pd = only(0).find((c) => c.issue_type === "possible_duplicate");
      if (pd && strong) expect([pd.severity, pd.confidence]).toEqual(["medium", ds === "same" ? 0.9 : 0.8]);
      if (pd && weak) expect([pd.severity, pd.confidence]).toEqual(["low", 0.55]);
      if (pd) expect(pd.evidence.related_item_ids).toEqual([id === "same" ? "A1" : "B2"]);
    });
  }
});
