import type { Suggester } from "../ai/suggester.js";
import { validateSuggestions } from "../ai/validateSuggestions.js";
import { categoryMismatches } from "../heuristics/categoryMismatch.js";
import { possibleDuplicates } from "../heuristics/possibleDuplicate.js";
import { toDataset } from "../input/toRecords.js";
import { DETERMINISTIC_RULES } from "../rules/index.js";
import type { DetectionSource, ReviewCandidate, Severity } from "../domain/types.js";

export interface AnalysisSummary {
  total_rows: number;
  rows_with_candidates: number;
  total_candidates: number;
  by_severity: Record<Severity, number>;
  by_source: Record<DetectionSource, number>;
  by_issue_type: Record<string, number>;
}

export interface AnalysisResult {
  summary: AnalysisSummary;
  candidates: ReviewCandidate[];
  warnings: string[];
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const child of Object.values(v)) deepFreeze(child);
  }
  return v;
}

/**
 * rows -> review candidates. The caller's rows are never touched: we analyze a frozen copy, so any
 * accidental write inside a rule throws in tests instead of silently altering data.
 */
export async function analyze(rows: readonly unknown[], suggester?: Suggester): Promise<AnalysisResult> {
  const frozen = deepFreeze(structuredClone(rows) as unknown[]);
  const dataset = toDataset(frozen);
  const warnings: string[] = [];

  const found: ReviewCandidate[] = [
    ...DETERMINISTIC_RULES.flatMap((rule) => rule.run(dataset)),
    ...possibleDuplicates(dataset),
    ...categoryMismatches(dataset),
  ];

  if (suggester) {
    try {
      const raw = await suggester.suggest(
        dataset.records.map(({ row_index, item_description, manufacturer, category }) => ({
          row_index, item_description, manufacturer, category,
        })),
      );
      const { candidates, rejected } = validateSuggestions(raw, dataset.records);
      found.push(...candidates);
      if (rejected > 0) warnings.push(`${rejected} AI suggestion(s) from '${suggester.name}' failed validation and were discarded.`);
    } catch (e) {
      warnings.push(`AI suggestion layer '${suggester.name}' failed (${(e as Error).message}); showing rule and heuristic results only.`);
    }
  }

  const unique = [...new Map(found.map((c) => [c.candidate_id, c])).values()].sort(
    (a, b) =>
      a.row_index - b.row_index ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.issue_type.localeCompare(b.issue_type) ||
      a.candidate_id.localeCompare(b.candidate_id),
  );

  const summary: AnalysisSummary = {
    total_rows: rows.length,
    rows_with_candidates: new Set(unique.map((c) => c.row_index)).size,
    total_candidates: unique.length,
    by_severity: { high: 0, medium: 0, low: 0 },
    by_source: { deterministic_rule: 0, heuristic: 0, ai_assisted_simulated: 0 },
    by_issue_type: {},
  };
  for (const c of unique) {
    summary.by_severity[c.severity]++;
    summary.by_source[c.source]++;
    summary.by_issue_type[c.issue_type] = (summary.by_issue_type[c.issue_type] ?? 0) + 1;
  }
  return { summary, candidates: unique, warnings };
}
