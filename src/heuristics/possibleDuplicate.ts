import { buildCandidate } from "../domain/candidate.js";
import type { Dataset, ItemRecord, ReviewCandidate } from "../domain/types.js";
import { normalizeManufacturer, normalizeMpn } from "../normalize/mpn.js";
import { itemIdentityKey } from "../normalize/identity.js";
import { isBlank, jaccard, matchTokens } from "../normalize/text.js";
import { DESCRIPTION_SIMILARITY_THRESHOLD, MAX_RELATED_RECORDS, POLICY } from "../policy.js";

export const POSSIBLE_DUPLICATE_ID = "H-001";

type Basis = "manufacturer_and_part_number" | "manufacturer_and_description";

interface Match {
  other: ItemRecord;
  similarity: number;
}

/** One candidate for `row`, however many records match it, so a large group cannot flood the reviewer. */
function candidateFor(row: ItemRecord, matches: Match[], basis: Basis): ReviewCandidate {
  // Most similar first, then by id: which matches are shown must not depend on upload order.
  const sorted = [...matches].sort(
    (a, b) =>
      b.similarity - a.similarity ||
      a.other.item_id.localeCompare(b.other.item_id) ||
      (a.other.source_system ?? "").localeCompare(b.other.source_system ?? "") ||
      a.other.row_index - b.other.row_index,
  );
  const shown = sorted.slice(0, MAX_RELATED_RECORDS);
  const maxSimilarity = Math.max(...sorted.map((m) => m.similarity));
  const strong = basis === "manufacturer_and_part_number";
  const policy = strong ? POLICY.possible_duplicate : POLICY.possible_duplicate_no_mpn;
  const confidence = strong
    ? maxSimilarity >= DESCRIPTION_SIMILARITY_THRESHOLD
      ? POLICY.possible_duplicate.withSimilarDescription
      : POLICY.possible_duplicate.baseConfidence
    : POLICY.possible_duplicate_no_mpn.confidence;

  const list = shown.map((m) => `'${m.other.item_id}' (${m.other.source_system ?? "no source"})`).join(", ");
  const more = sorted.length > shown.length ? ` and ${sorted.length - shown.length} more` : "";
  const why = strong
    ? `share manufacturer '${row.manufacturer?.trim()}' and a matching part number once normalized ('${row.manufacturer_part_number?.trim()}')`
    : `share manufacturer '${row.manufacturer?.trim()}' and have very similar descriptions, but a part number is missing so this is a weak match`;

  return buildCandidate({
    rule_id: POSSIBLE_DUPLICATE_ID,
    rule_version: 1,
    issue_type: "possible_duplicate",
    source: "heuristic",
    severity: policy.severity,
    confidence,
    explanation: `Potential duplicate: item '${row.item_id}' (${row.source_system ?? "no source"}) and ${sorted.length} other record(s) ${why}: ${list}${more}.`,
    suggested_action: "Review these records side by side and decide whether they describe the same item before approval.",
    evidence: {
      fields: strong ? ["manufacturer", "manufacturer_part_number", "item_description"] : ["manufacturer", "item_description"],
      related_item_ids: shown.map((m) => m.other.item_id),
      related_row_indexes: shown.map((m) => m.other.row_index),
      score_breakdown: {
        match_basis: basis,
        matching_records: sorted.length,
        description_similarity: Math.round(maxSimilarity * 100) / 100,
      },
    },
    row,
    related_key: basis, // one candidate per row per basis; id stays stable if the group grows
  });
}

/**
 * Heuristic: manufacturer + normalized part number match (strong), or, when a part number is
 * missing, manufacturer + very similar description (weak). Candidates only; never merges anything.
 */
export function possibleDuplicates({ records }: Dataset): ReviewCandidate[] {
  const out: ReviewCandidate[] = [];
  const tokens = new Map<number, string[]>(records.map((r) => [r.row_index, matchTokens(r.item_description)]));
  // Same item_id in the same source is reported by the key-collision rule; do not raise a second card for it.
  const sameKey = (a: ItemRecord, b: ItemRecord) => itemIdentityKey(a) === itemIdentityKey(b);
  const sim = (a: ItemRecord, b: ItemRecord) => jaccard(tokens.get(a.row_index) ?? [], tokens.get(b.row_index) ?? []);

  // Strong: hash index on manufacturer|mpn (blank mpn or manufacturer never enters the index).
  const byKey = new Map<string, ItemRecord[]>();
  for (const r of records) {
    if (isBlank(r.manufacturer) || isBlank(r.manufacturer_part_number)) continue;
    const key = `${normalizeManufacturer(r.manufacturer as string)}|${normalizeMpn(r.manufacturer_part_number as string)}`;
    const g = byKey.get(key);
    if (g) g.push(r);
    else byKey.set(key, [r]);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      const matches = group.filter((o) => o !== row && !sameKey(row, o)).map((other) => ({ other, similarity: sim(row, other) }));
      if (matches.length > 0) out.push(candidateFor(row, matches, "manufacturer_and_part_number"));
    }
  }

  // Weak: same manufacturer, at least one side has no part number, descriptions nearly identical.
  const byMfr = new Map<string, ItemRecord[]>();
  for (const r of records) {
    if (isBlank(r.manufacturer)) continue;
    const key = normalizeManufacturer(r.manufacturer as string);
    const g = byMfr.get(key);
    if (g) g.push(r);
    else byMfr.set(key, [r]);
  }
  for (const group of byMfr.values()) {
    for (const row of group) {
      const matches: Match[] = [];
      for (const other of group) {
        if (other === row || sameKey(row, other)) continue;
        if (!isBlank(row.manufacturer_part_number) && !isBlank(other.manufacturer_part_number)) continue;
        const similarity = sim(row, other);
        if (similarity >= POLICY.possible_duplicate_no_mpn.minSimilarity) matches.push({ other, similarity });
      }
      if (matches.length > 0) out.push(candidateFor(row, matches, "manufacturer_and_description"));
    }
  }
  return out;
}
