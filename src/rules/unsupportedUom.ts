import { buildCandidate } from "../domain/candidate.js";
import type { ReviewCandidate } from "../domain/types.js";
import { isBlank } from "../normalize/text.js";
import { canonicalUom, SUPPORTED_UOM } from "../normalize/uom.js";
import { POLICY } from "../policy.js";
import type { Rule } from "./rule.js";

export const unsupportedUom: Rule = {
  id: "DQ-005",
  version: 1,
  run: ({ records }) => {
    const out: ReviewCandidate[] = [];
    for (const r of records) {
      if (isBlank(r.unit_of_measure)) {
        out.push(
          buildCandidate({
            rule_id: "DQ-005",
            rule_version: 1,
            issue_type: "missing_unit_of_measure",
            source: "deterministic_rule",
            ...POLICY.missing_unit_of_measure,
            explanation: "Candidate issue detected: unit of measure is missing.",
            suggested_action: "Request the unit of measure from the source owner.",
            evidence: { fields: ["unit_of_measure"], observed: { unit_of_measure: r.unit_of_measure } },
            row: r,
          }),
        );
      } else if (canonicalUom(r.unit_of_measure as string) === null) {
        out.push(
          buildCandidate({
            rule_id: "DQ-005",
            rule_version: 1,
            issue_type: "unsupported_unit_of_measure",
            source: "deterministic_rule",
            ...POLICY.unsupported_unit_of_measure,
            explanation: `Candidate issue detected: unit of measure '${(r.unit_of_measure as string).trim()}' is not in the supported list.`,
            suggested_action: "Needs review: confirm the intended unit with the source owner; supported units are listed in the evidence.",
            evidence: {
              fields: ["unit_of_measure"],
              observed: { unit_of_measure: r.unit_of_measure },
              score_breakdown: { supported_units: [...SUPPORTED_UOM] },
            },
            row: r,
          }),
        );
      }
    }
    return out;
  },
};
