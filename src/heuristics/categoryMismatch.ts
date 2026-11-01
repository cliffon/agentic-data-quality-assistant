import { CATEGORY_GROUPS } from "../config/businessConfig.js";
import { buildCandidate } from "../domain/candidate.js";
import type { Dataset, ReviewCandidate } from "../domain/types.js";
import { isBlank, tokenize } from "../normalize/text.js";
import { POLICY } from "../policy.js";

export const CATEGORY_MISMATCH_ID = "H-002";

const singular = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
const groups = Object.entries(CATEGORY_GROUPS);

/** Group whose label list contains this category, or undefined if the category is not a known label. */
function groupOf(category: string): string | undefined {
  const c = category.trim().toLowerCase();
  return groups.find(([, g]) => g.labels.some((l) => l.toLowerCase() === c))?.[0];
}

/**
 * Only fires when the description points at exactly one group AND the record's category is a known
 * label of a different group. Unknown labels are never judged (we cannot tell if they are wrong).
 */
export function categoryMismatches({ records }: Dataset): ReviewCandidate[] {
  const out: ReviewCandidate[] = [];
  for (const r of records) {
    if (isBlank(r.category)) continue;
    const recordGroup = groupOf(r.category as string);
    if (!recordGroup) continue;
    const tokens = new Set(tokenize(r.item_description).map(singular));
    const hits = groups
      .map(([name, g]) => ({ name, hits: g.keywords.filter((w) => tokens.has(w)) }))
      .filter((h) => h.hits.length > 0);
    if (hits.length !== 1) continue; // none, or ambiguous across groups
    const { name: expected, hits: keywords } = hits[0]!;
    if (expected === recordGroup) continue;

    const p = POLICY.category_mismatch_candidate;
    const confidence = Math.min(p.max, p.baseConfidence + p.perExtraKeyword * (keywords.length - 1));
    out.push(
      buildCandidate({
        rule_id: CATEGORY_MISMATCH_ID,
        rule_version: 1,
        issue_type: "category_mismatch_candidate",
        source: "heuristic",
        severity: p.severity,
        confidence,
        explanation: `Candidate issue detected: description suggests a ${expected.toLowerCase()} item (${keywords.join(", ")}), but category is '${(r.category as string).trim()}'.`,
        suggested_action: "Review category assignment before approval.",
        evidence: {
          fields: ["item_description", "category"],
          observed: { item_description: r.item_description, category: r.category },
          score_breakdown: { keyword_hits: keywords, expected_category: expected, record_category_group: recordGroup },
        },
        row: r,
      }),
    );
  }
  return out;
}
