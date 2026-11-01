import type { Severity } from "./domain/types.js";

/**
 * Single home for severity/confidence decisions (F8).
 * Deterministic rules use fixed confidence. Heuristic/AI confidence is computed from evidence
 * (see the heuristics) and bounded here.
 */
export const POLICY = {
  malformed_row: { severity: "high", confidence: 1.0 },
  duplicate_item_id: { severity: "high", confidence: 0.99 },
  missing_part_number: { severity: "medium", confidence: 0.95 },
  unsupported_unit_of_measure: { severity: "medium", confidence: 0.9 },
  missing_unit_of_measure: { severity: "low", confidence: 0.9 },
  weak_description: { severity: "medium", confidence: 0.85 },
  possible_duplicate: { severity: "medium", baseConfidence: 0.8, withSimilarDescription: 0.9 },
  possible_duplicate_no_mpn: { severity: "low", confidence: 0.55, minSimilarity: 0.8 },
  category_mismatch_candidate: { severity: "low", baseConfidence: 0.7, perExtraKeyword: 0.05, max: 0.85 },
  normalized_description_suggestion: { severity: "low", confidence: 0.6 },
} as const satisfies Record<string, { severity: Severity } & Record<string, unknown>>;

/** AI-assisted output can never be more confident, or more severe, than this. */
export const AI_CONFIDENCE_CAP = 0.6;
export const AI_MAX_SEVERITY: Severity = "medium";
export const AI_MAX_SUGGESTION_LENGTH = 200;

/** Similarity of two descriptions that we call "also similar". */
export const DESCRIPTION_SIMILARITY_THRESHOLD = 0.6;

/** A duplicate candidate lists at most this many other records; the total is reported separately. */
export const MAX_RELATED_RECORDS = 10;
