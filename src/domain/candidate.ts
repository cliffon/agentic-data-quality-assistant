import { createHash } from "node:crypto";
import type { CandidateInput, ReviewCandidate } from "./types.js";

/** The only place ReviewCandidate objects are constructed, so every one has the same invariants. */
export function buildCandidate(input: CandidateInput): ReviewCandidate {
  const id = createHash("sha1")
    .update([input.rule_id, input.row.row_index, input.row.item_id ?? "", input.related_key ?? ""].join("|"))
    .digest("hex")
    .slice(0, 12);
  return {
    candidate_id: id,
    item_id: input.row.item_id,
    row_index: input.row.row_index,
    source_system: input.row.source_system,
    issue_type: input.issue_type,
    severity: input.severity,
    confidence: Math.round(input.confidence * 100) / 100,
    explanation: input.explanation,
    suggested_action: input.suggested_action,
    source: input.source,
    rule_id: input.rule_id,
    rule_version: input.rule_version,
    evidence: input.evidence ?? {},
    review_status: "needs_review",
  };
}
