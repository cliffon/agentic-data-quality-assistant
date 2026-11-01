import { buildCandidate } from "../domain/candidate.js";
import { STOP_WORDS, VAGUE_WORDS, WEAK_DESCRIPTION } from "../config/businessConfig.js";
import { tokenize } from "../normalize/text.js";
import { POLICY } from "../policy.js";
import type { Rule } from "./rule.js";

const STOP = new Set(STOP_WORDS);
const VAGUE = new Set(VAGUE_WORDS);

/** Weak = nothing a steward could identify the item by. Thresholds live in businessConfig. */
export function weakReason(description: string): string | null {
  const trimmed = description.trim();
  const meaningful = tokenize(trimmed).filter((t) => !STOP.has(t));
  if (meaningful.length === 0) return "it has no meaningful words";
  if (trimmed.length < WEAK_DESCRIPTION.minChars) return `it is shorter than ${WEAK_DESCRIPTION.minChars} characters`;
  if (meaningful.every((t) => VAGUE.has(t))) return "it only contains generic words";
  if (meaningful.length === 1) return "it contains a single word";
  if (meaningful.length < WEAK_DESCRIPTION.minWordsWithoutDigit && !meaningful.some((t) => /\d/.test(t)))
    return "it has very few descriptive words and no size, rating or part number";
  return null;
}

export const weakDescription: Rule = {
  id: "DQ-002",
  version: 1,
  run: ({ records }) =>
    records.flatMap((r) => {
      const reason = weakReason(r.item_description);
      if (!reason) return [];
      return [
        buildCandidate({
          rule_id: "DQ-002",
          rule_version: 1,
          issue_type: "weak_description",
          source: "deterministic_rule",
          ...POLICY.weak_description,
          explanation: `Candidate issue detected: description '${r.item_description.trim()}' may be too vague because ${reason}.`,
          suggested_action: "Request a fuller description (type, size/rating, material or part number) from the source owner.",
          evidence: { fields: ["item_description"], observed: { item_description: r.item_description } },
          row: r,
        }),
      ];
    }),
};
