import { buildCandidate } from "../domain/candidate.js";
import { POLICY } from "../policy.js";
import type { Rule } from "./rule.js";

function peek(raw: unknown, field: string): string | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>)[field];
  if ((typeof v === "string" && v.trim() !== "") || typeof v === "number") return String(v);
  return null;
}

export const malformedRow: Rule = {
  id: "DQ-007",
  version: 1,
  run: ({ malformed }) =>
    malformed.map((m) =>
      buildCandidate({
        rule_id: "DQ-007",
        rule_version: 1,
        issue_type: "malformed_row",
        source: "deterministic_rule",
        ...POLICY.malformed_row,
        explanation: `Candidate issue detected: row ${m.row_index + 1} is incomplete or malformed. ${m.reasons.join(" ")}`,
        suggested_action: "Needs review: ask the source owner to supply or correct the row before it is considered for approval.",
        evidence: { observed: { raw: m.raw } },
        row: { row_index: m.row_index, item_id: peek(m.raw, "item_id"), source_system: peek(m.raw, "source_system") },
      }),
    ),
};
