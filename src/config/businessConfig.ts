/**
 * Everything in this file is a BUSINESS DECISION, not engineering logic.
 * Values are best guesses taken from sample data and must be confirmed with the data owners
 * before real use (see README, "Needs business verification"). Rules read from here only.
 */

/** Text that means "nobody filled this in". Compared case-insensitively after trim. */
export const PLACEHOLDER_VALUES: readonly string[] = [
  "n/a", "na", "none", "null", "tbd", "-", "--", "?", "unknown", "unspecified", "not specified", "not available", "nil",
];

/** Units accepted as-is. VERIFY: replace with the company UoM master list. */
export const SUPPORTED_UOM: readonly string[] = ["EA", "PC", "BOX", "PK", "SET", "PR", "KG", "G", "LB", "M", "FT", "L", "ML", "ROLL"];

/**
 * Spellings mapped onto a supported unit. Only unambiguous abbreviations of units already supported.
 * VERIFY before adding new units seen in data but not listed (NOS, KIT, BTL, CAN, DOZEN, SQM, ...).
 */
export const UOM_ALIASES: Readonly<Record<string, string>> = {
  EACH: "EA", PCS: "PC", PIECE: "PC", PIECES: "PC", PACK: "PK", PAIR: "PR",
  METER: "M", METRE: "M", MTR: "M", MTRS: "M",
  LITER: "L", LITRE: "L", LTR: "L", LTRS: "L",
  KGS: "KG",
};

/**
 * Words dropped from a manufacturer name before comparing, so "SKF India" = "SKF" and
 * "Schneider Electric" = "SCHNEIDER". VERIFY: too broad merges different makers, too narrow misses duplicates.
 */
export const MANUFACTURER_NOISE_WORDS: readonly string[] = [
  "INDIA", "ELECTRIC", "LTD", "LIMITED", "PVT", "PRIVATE", "INC", "CORP", "CORPORATION", "CO", "COMPANY", "GMBH", "AG", "LLC", "LLP", "GROUP",
];

export const STOP_WORDS: readonly string[] = ["a", "an", "the", "of", "for", "and", "with", "to", "in"];

/** Descriptions made only of these words are "weak". VERIFY with stewards. */
export const VAGUE_WORDS: readonly string[] = [
  "bearing", "valve", "part", "parts", "item", "items", "misc", "miscellaneous", "tbd", "spare", "material", "component", "stuff",
];

/** Weak-description thresholds. VERIFY: how many words / what attributes make a description identifiable. */
export const WEAK_DESCRIPTION = {
  minChars: 4,
  /** Descriptions with no digit (size, rating, part number) need at least this many meaningful words. */
  minWordsWithoutDigit: 3,
};

/**
 * Category check. A mismatch is only claimed when the description clearly points at one group AND the
 * record's category is a known label of a DIFFERENT group. A category label listed nowhere here
 * (PPE, Lubricants, ...) is never judged. VERIFY: replace with the real category taxonomy.
 */
export interface CategoryGroup {
  readonly labels: readonly string[];
  readonly keywords: readonly string[];
}
export const CATEGORY_GROUPS: Readonly<Record<string, CategoryGroup>> = {
  Mechanical: {
    labels: ["Mechanical", "Fasteners", "Seals & Gaskets", "Piping", "Piping Accessories", "Valves", "Pumps"],
    keywords: ["bearing", "gasket", "bolt", "nut", "washer", "shaft", "gear", "sprocket", "coupling", "bushing", "pulley", "pipe", "flange"],
  },
  Electrical: {
    labels: ["Electrical"],
    keywords: ["resistor", "capacitor", "relay", "fuse", "transformer", "contactor", "breaker", "inductor", "diode", "terminal", "cable", "lamp"],
  },
};
