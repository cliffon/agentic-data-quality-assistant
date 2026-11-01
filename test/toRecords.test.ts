import { describe, expect, it } from "vitest";
import { InputError } from "../src/input/errors.js";
import { parseCsv } from "../src/input/parseCsv.js";
import { parseJson } from "../src/input/parseJson.js";
import { toDataset } from "../src/input/toRecords.js";
import { rec } from "./helpers.js";

describe("toDataset", () => {
  it("empty input gives empty dataset", () => expect(toDataset([])).toEqual({ records: [], malformed: [] }));

  it.each([
    ["null row", null],
    ["array row", []],
    ["string row", "x"],
    ["missing item_id", rec({ item_id: undefined })],
    ["blank item_id", rec({ item_id: "   " })],
    ["null description", rec({ item_description: null })],
    ["object-typed field", rec({ manufacturer: { a: 1 } })],
  ])("%s is malformed", (_n, row) => {
    const d = toDataset([row]);
    expect(d.records).toHaveLength(0);
    expect(d.malformed).toHaveLength(1);
    expect(d.malformed[0]!.reasons.length).toBeGreaterThan(0);
  });

  it("coerces numeric id and keeps optional nulls as null", () => {
    const d = toDataset([{ item_id: 1001, item_description: "x y", manufacturer: null }]);
    expect(d.records[0]).toMatchObject({ item_id: "1001", manufacturer: null, unit_of_measure: null, row_index: 0 });
  });

  it("one bad row does not hide good rows and indexes are preserved", () => {
    const d = toDataset([rec(), null, rec({ item_id: "3" })]);
    expect(d.records.map((r) => r.row_index)).toEqual([0, 2]);
    expect(d.malformed.map((m) => m.row_index)).toEqual([1]);
  });
});

describe("parseJson / parseCsv", () => {
  it("rejects invalid JSON and non-arrays", () => {
    expect(() => parseJson("{nope")).toThrow(InputError);
    expect(() => parseJson('{"a":1}')).toThrow(InputError);
  });
  it("parses quoted commas, BOM and blank lines", () => {
    const rows = parseCsv('﻿item_id,item_description\n\n1,"a, b"\n');
    expect(rows).toEqual([{ item_id: "1", item_description: "a, b" }]);
  });
  it("returns ragged rows as arrays so they become malformed, header-only is empty", () => {
    const rows = parseCsv("item_id,item_description\n1\n");
    expect(Array.isArray(rows[0])).toBe(true);
    expect(parseCsv("item_id,item_description\n")).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });
  it("rejects broken quoting", () => expect(() => parseCsv('a,b\n"x,1\n')).toThrow(InputError));
});
