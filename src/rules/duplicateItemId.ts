import { buildCandidate } from "../domain/candidate.js";
import type { ItemRecord, ReviewCandidate } from "../domain/types.js";
import { itemIdentityKey } from "../normalize/identity.js";
import { POLICY } from "../policy.js";
import type { Rule } from "./rule.js";

/** Same item_id inside one source system is a key collision. The same id in different systems is normal. */
export const duplicateItemId: Rule = {
  id: "DQ-003",
  version: 1,
  run: ({ records }) => {
    const groups = new Map<string, ItemRecord[]>();
    for (const r of records) {
      const key = itemIdentityKey(r);
      const g = groups.get(key);
      if (g) g.push(r);
      else groups.set(key, [r]);
    }
    const out: ReviewCandidate[] = [];
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const rows = group.map((g) => g.row_index);
      for (const r of group) {
        out.push(
          buildCandidate({
            rule_id: "DQ-003",
            rule_version: 1,
            issue_type: "duplicate_item_id",
            source: "deterministic_rule",
            ...POLICY.duplicate_item_id,
            explanation: `Candidate issue detected: item_id '${r.item_id.trim()}' appears ${group.length} times in source system '${r.source_system ?? "(none)"}' (rows ${rows.map((i) => i + 1).join(", ")}).`,
            suggested_action: "Needs review: confirm which row is authoritative or whether the identifier was reused in error.",
            evidence: {
              fields: ["item_id", "source_system"],
              observed: { item_id: r.item_id, source_system: r.source_system },
              related_row_indexes: rows.filter((i) => i !== r.row_index),
            },
            row: r,
            related_key: rows.join(","),
          }),
        );
      }
    }
    return out;
  },
};
