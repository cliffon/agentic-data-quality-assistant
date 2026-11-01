import { z } from "zod";
import { buildCandidate } from "../domain/candidate.js";
import type { ItemRecord, ReviewCandidate } from "../domain/types.js";
import { AI_CONFIDENCE_CAP, AI_MAX_SUGGESTION_LENGTH, POLICY } from "../policy.js";

export const AI_RULE_ID = "A-001";

const suggestionSchema = z.object({
  row_index: z.number().int().nonnegative(),
  suggested_value: z.string(),
  rationale: z.string().min(1).max(500),
  confidence: z.number(),
});

export interface ValidationResult {
  candidates: ReviewCandidate[];
  rejected: number;
}

/**
 * Trust boundary. Anything the suggester returns is checked here: shape, known row, length,
 * actually-different, confidence clamped to the AI cap. Source and severity are set by us, never by it.
 */
export function validateSuggestions(raw: readonly unknown[], records: readonly ItemRecord[]): ValidationResult {
  const byRow = new Map(records.map((r) => [r.row_index, r]));
  const seen = new Set<number>();
  const candidates: ReviewCandidate[] = [];
  let rejected = 0;

  for (const item of raw) {
    const parsed = suggestionSchema.safeParse(item);
    const rec = parsed.success ? byRow.get(parsed.data.row_index) : undefined;
    const value = parsed.success ? parsed.data.suggested_value.trim() : "";
    if (
      !parsed.success || !rec || seen.has(rec.row_index) ||
      !Number.isFinite(parsed.data.confidence) ||
      value === "" || value.length > AI_MAX_SUGGESTION_LENGTH ||
      value === rec.item_description.trim()
    ) {
      rejected++;
      continue;
    }
    seen.add(rec.row_index);
    candidates.push(
      buildCandidate({
        rule_id: AI_RULE_ID,
        rule_version: 1,
        issue_type: "normalized_description_suggestion",
        source: "ai_assisted_simulated",
        severity: POLICY.normalized_description_suggestion.severity,
        confidence: Math.max(0, Math.min(AI_CONFIDENCE_CAP, parsed.data.confidence)),
        explanation: `Suggested normalized description for review: '${value}' (${parsed.data.rationale}) The original description is unchanged.`,
        suggested_action: "Review the suggested wording; accept or reject it. Nothing is applied automatically.",
        evidence: { fields: ["item_description"], observed: { item_description: rec.item_description }, suggested_value: value },
        row: rec,
      }),
    );
  }
  return { candidates, rejected };
}
