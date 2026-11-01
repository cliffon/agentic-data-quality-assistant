import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/input/parseCsv.js";
import { analyze } from "../src/pipeline/analyze.js";
import { rec } from "./helpers.js";

const found = async (rows: unknown[]) =>
  (await analyze(rows)).candidates.map((c) => `${c.row_index}:${c.issue_type}`).sort();

const bolt = (o: Record<string, unknown> = {}) =>
  rec({ item_id: "2", item_description: "Hex bolt M8x40", manufacturer: "Bossard", manufacturer_part_number: "BN-123", source_system: "ERP-A", ...o });
const resistor = rec({ item_id: "3", item_description: "Resistor 10k ohm 1/4W", manufacturer: "Yageo", manufacturer_part_number: "CFR-25JB", category: "Electrical" });

describe("hand-picked combinations (exact expected findings, nothing extra)", () => {
  it("S1 three clean, distinct records -> nothing", async () => expect(await found([rec({ item_id: "1" }), bolt(), resistor])).toEqual([]));

  it("S2 the assignment sample (no AI layer)", async () =>
    expect(await found([
      rec({ item_id: "1001", item_description: "bearing", manufacturer_part_number: "", source_system: "ERP-A" }),
      rec({ item_id: "1002", manufacturer_part_number: "6205-ZZ", category: "Electrical", source_system: "ERP-B" }),
    ])).toEqual(["0:missing_part_number", "0:weak_description", "1:category_mismatch_candidate"]));

  it("S3 row with blank id and null description -> malformed only", async () =>
    expect(await found([{ item_id: "", item_description: null }])).toEqual(["0:malformed_row"]));

  it("S4 every optional field is whitespace -> only missing UoM", async () =>
    expect(await found([{ item_id: "5", item_description: "Hex bolt M8x40", manufacturer: " ", manufacturer_part_number: " ", category: " ", unit_of_measure: " ", source_system: " " }]))
      .toEqual(["0:missing_unit_of_measure"]));

  it("S5 numeric 1001 and string '1001' in same source collide", async () =>
    expect(await found([bolt({ item_id: 1001 }), rec({ item_id: "1001", source_system: "ERP-A", manufacturer: "FAG", manufacturer_part_number: "X1", item_description: "Deep groove ball bearing" })]))
      .toEqual(["0:duplicate_item_id", "1:duplicate_item_id"]));

  it("S6 same id in different sources is legitimate", async () =>
    expect(await found([bolt({ item_id: "7", source_system: "ERP-A" }), resistor && rec({ ...resistor, item_id: "7", source_system: "ERP-B" })])).toEqual([]));

  it("S7 three-way duplicate across three systems, three MPN spellings (one candidate per row)", async () => {
    const mk = (i: number, mpn: string, src: string) => rec({ item_id: String(i), manufacturer_part_number: mpn, source_system: src });
    expect(await found([mk(1, "6205-ZZ", "A"), mk(2, "6205 ZZ", "B"), mk(3, "6205zz", "C")])).toEqual([
      "0:possible_duplicate", "1:possible_duplicate", "2:possible_duplicate",
    ]);
  });

  it("S8 malformed rows keep indexes stable around good rows", async () =>
    expect(await found([rec({ item_id: "1" }), null, bolt({ manufacturer_part_number: "" }), "junk"])).toEqual(["1:malformed_row", "2:missing_part_number", "3:malformed_row"]));

  it("S9 UoM aliases pass, unknown words fail", async () =>
    expect(await found([rec({ item_id: "1", unit_of_measure: "pcs" }), bolt({ unit_of_measure: "Dozen" })])).toEqual(["1:unsupported_unit_of_measure"]));

  it("S10 Spanish description with attributes is not weak", async () =>
    expect(await found([rec({ item_description: "rodamiento de bolas 6205 2RS", manufacturer_part_number: "6205-2RS" })])).toEqual([]));

  it("S11 abbreviation-heavy 'BRG' under wrong category: no keyword hit (documented low recall)", async () =>
    expect(await found([rec({ item_description: "BRG 6205 ZZ SKF", category: "Electrical" })])).toEqual([]));

  it("S12 description naming two categories -> ambiguous, no mismatch", async () =>
    expect(await found([rec({ item_description: "Ceramic capacitor 100nF and bearing", category: "Electrical" })])).toEqual([]));

  it("S13 plural + upper-case + lower-case category still detected", async () =>
    expect(await found([rec({ item_description: "BEARINGS SKF 6205", category: "electrical" })])).toEqual(["0:category_mismatch_candidate"]));

  it("S14 both rows lack MPN, identical description -> missing MPN x2 + weak duplicate x2", async () => {
    const mk = (i: string, src: string) => rec({ item_id: i, source_system: src, manufacturer_part_number: "", item_description: "SKF deep groove ball bearing" });
    expect(await found([mk("1", "A"), mk("2", "B")])).toEqual(["0:missing_part_number", "0:possible_duplicate", "1:missing_part_number", "1:possible_duplicate"]);
  });

  it("S15 fully identical rows in one source -> one key-collision card each, no extra duplicate card", async () =>
    expect(await found([rec(), rec()])).toEqual(["0:duplicate_item_id", "1:duplicate_item_id"]));

  it("S16 tabs/newlines and very long descriptions are fine", async () =>
    expect(await found([rec({ item_id: "1", item_description: "SKF\tBearing\n6205 ZZ" }), bolt({ item_description: "Hex bolt M8x40 ".repeat(1000) })])).toEqual([]));

  it("S17 number manufacturer coerces; boolean category / object UoM are malformed", async () =>
    expect(await found([bolt({ item_id: "1", manufacturer: 123, manufacturer_part_number: "" }), bolt({ item_id: "2", category: true }), bolt({ item_id: "3", unit_of_measure: { a: 1 } })]))
      .toEqual(["0:missing_part_number", "1:malformed_row", "2:malformed_row"]));

  it("S18 unknown extra columns are ignored", async () => expect(await found([{ ...rec(), price: 5, note: "x" }])).toEqual([]));

  it("S19 CJK single-token description (known limitation: flagged weak, since no word spaces)", async () =>
    expect(await found([rec({ item_description: "ロールベアリング" })])).toEqual(["0:weak_description"]));

  it("S20 same MPN but different manufacturers are not duplicates", async () =>
    expect(await found([rec({ item_id: "1" }), rec({ item_id: "2", manufacturer: "FAG" })])).toEqual([]));
});

describe("CSV variants through the same pipeline", () => {
  const run = async (csv: string) => (await analyze(parseCsv(csv))).candidates.map((c) => `${c.row_index}:${c.issue_type}`).sort();

  it("C1 BOM + CRLF + padded header + quoted comma + trailing blank lines", async () =>
    expect(await run('﻿ item_id ,item_description,manufacturer,manufacturer_part_number,category,unit_of_measure,source_system\r\n1,"Hex bolt, M8x40",Bossard,BN-123,Mechanical,EA,ERP-A\r\n\r\n\r\n')).toEqual([]));

  it("C2 ragged row is malformed at the right index; extra column elsewhere is ignored", async () =>
    expect(await run("item_id,item_description,unit_of_measure,foo\n1,Hex bolt M8x40,EA,x\n2,Hex bolt M10x40\n3,Hex bolt M12x40,EA,y\n")).toEqual(["1:malformed_row"]));

  it("C3 empty cells behave like null", async () =>
    expect(await run("item_id,item_description,manufacturer,manufacturer_part_number,unit_of_measure\n1,Hex bolt M8x40,Bossard,,EA\n")).toEqual(["0:missing_part_number"]));

  it("C4 header only and empty file -> no candidates", async () => {
    expect(await run("item_id,item_description\n")).toEqual([]);
    expect(await run("")).toEqual([]);
  });

  it("C5 missing item_id column makes every row malformed, not a crash", async () =>
    expect(await run("item_description\nHex bolt M8x40\nHex bolt M10x40\n")).toEqual(["0:malformed_row", "1:malformed_row"]));
});
