import { buildCandidate } from "../domain/candidate.js";
import { isBlank } from "../normalize/text.js";
import { POLICY } from "../policy.js";
import type { Rule } from "./rule.js";

export const missingPartNumber: Rule = {
  id: "DQ-001",
  version: 1,
  run: ({ records }) =>
    records
      .filter((r) => !isBlank(r.manufacturer) && isBlank(r.manufacturer_part_number))
      .map((r) =>
        buildCandidate({
          rule_id: "DQ-001",
          rule_version: 1,
          issue_type: "missing_part_number",
          source: "deterministic_rule",
          ...POLICY.missing_part_number,
          explanation: `Candidate issue detected: manufacturer '${r.manufacturer?.trim()}' is present but manufacturer part number is missing.`,
          suggested_action: "Request the manufacturer part number from the source owner.",
          evidence: {
            fields: ["manufacturer", "manufacturer_part_number"],
            observed: { manufacturer: r.manufacturer, manufacturer_part_number: r.manufacturer_part_number },
          },
          row: r,
        }),
      ),
};
