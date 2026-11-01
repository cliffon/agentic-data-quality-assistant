import { describe, expect, it } from "vitest";
import { normalizeMpn } from "../src/normalize/mpn.js";
import { isBlank, jaccard } from "../src/normalize/text.js";
import { canonicalUom } from "../src/normalize/uom.js";

describe("isBlank", () => {
  it.each([null, undefined, "", "   ", "\t\n", "N/A", " tbd ", "-", "NULL"])("treats %j as blank", (v) => expect(isBlank(v)).toBe(true));
  it.each(["SKF", "0", "6205-ZZ", 0])("treats %j as present", (v) => expect(isBlank(v)).toBe(false));
});

describe("normalizeMpn", () => {
  it.each(["6205-ZZ", "6205 zz", "6205ZZ", " 6205_zz ", "6205.ZZ"])("%j -> 6205ZZ", (v) => expect(normalizeMpn(v)).toBe("6205ZZ"));
});

describe("canonicalUom", () => {
  it.each([["EA", "EA"], [" ea ", "EA"], ["Each", "EA"], ["pcs", "PC"]])("%j -> %j", (i, o) => expect(canonicalUom(i)).toBe(o));
  it.each(["XYZ", "EAA", "12"])("%j unsupported", (v) => expect(canonicalUom(v)).toBeNull());
});

describe("jaccard", () => {
  it("is 0 for two empty sets and 1 for identical", () => {
    expect(jaccard([], [])).toBe(0);
    expect(jaccard(["a", "b"], ["b", "a"])).toBe(1);
  });
});

import { normalizeManufacturer } from "../src/normalize/mpn.js";
import { matchTokens } from "../src/normalize/text.js";

describe("business-config driven normalization", () => {
  it.each(["Unspecified", "not specified", "NIL"])("%j is a placeholder", (v) => expect(isBlank(v)).toBe(true));
  it.each([["LTR", "L"], ["MTR", "M"], ["MTRS", "M"], ["kgs", "KG"]])("unit alias %j -> %j", (i, o) => expect(canonicalUom(i)).toBe(o));
  it.each(["CAN", "NOS", "KIT", "BTL", "DOZEN", "SQM"])("%j stays unsupported until the business confirms it", (u) => expect(canonicalUom(u)).toBeNull());
  it.each([["SKF India", "SKF"], ["Schneider Electric", "SCHNEIDER"], ["  skf ", "SKF"], ["L&T", "LT"], ["Wika", "WIKA"]])("manufacturer %j matches as %j", (i, o) => expect(normalizeManufacturer(i)).toBe(o));
  it("keeps the name when only noise words are present", () => expect(normalizeManufacturer("Electric Co")).toBe("ELECTRICCO"));
  it("manufacturers that differ stay different", () => expect(normalizeManufacturer("SKF")).not.toBe(normalizeManufacturer("FAG")));
  it("dimension spacing is ignored when comparing descriptions", () => {
    expect(matchTokens("Hex bolt M10 x 50")).toEqual(matchTokens("Hex bolt M10x50"));
    expect(matchTokens("O-ring 30 x 3 mm")).toContain("30x3");
    expect(matchTokens("Box x ray")).toEqual(["box", "x", "ray"]);
  });
});
