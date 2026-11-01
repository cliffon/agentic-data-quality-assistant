export const ISSUE_TYPES = [
  "missing_part_number",
  "weak_description",
  "possible_duplicate",
  "duplicate_item_id",
  "category_mismatch_candidate",
  "unsupported_unit_of_measure",
  "missing_unit_of_measure",
  "normalized_description_suggestion",
  "malformed_row",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const DETECTION_SOURCES = ["deterministic_rule", "heuristic", "ai_assisted_simulated"] as const;
export type DetectionSource = (typeof DETECTION_SOURCES)[number];

/** A usable row. Field values are kept exactly as uploaded (null = absent). */
export interface ItemRecord {
  readonly row_index: number;
  readonly item_id: string;
  readonly item_description: string;
  readonly manufacturer: string | null;
  readonly manufacturer_part_number: string | null;
  readonly category: string | null;
  readonly unit_of_measure: string | null;
  readonly source_system: string | null;
}

/** A row that could not be turned into an ItemRecord. */
export interface MalformedRow {
  readonly row_index: number;
  readonly reasons: readonly string[];
  readonly raw: unknown;
}

export interface Evidence {
  fields?: string[];
  observed?: Record<string, unknown>;
  related_item_ids?: string[];
  related_row_indexes?: number[];
  suggested_value?: string;
  score_breakdown?: Record<string, unknown>;
}

export interface ReviewCandidate {
  candidate_id: string;
  item_id: string | null;
  row_index: number;
  source_system: string | null;
  issue_type: IssueType;
  severity: Severity;
  confidence: number;
  explanation: string;
  suggested_action: string;
  source: DetectionSource;
  rule_id: string;
  rule_version: number;
  evidence: Evidence;
  review_status: "needs_review";
}

export interface Dataset {
  readonly records: readonly ItemRecord[];
  readonly malformed: readonly MalformedRow[];
}

/** Everything a rule/heuristic may know about a finding; the builder fills in the rest. */
export interface CandidateInput {
  rule_id: string;
  rule_version: number;
  issue_type: IssueType;
  source: DetectionSource;
  severity: Severity;
  confidence: number;
  explanation: string;
  suggested_action: string;
  evidence?: Evidence;
  /** Anchor row. */
  row: { row_index: number; item_id: string | null; source_system: string | null };
  /** Included in candidate_id so one row can carry several distinct pair findings. */
  related_key?: string;
}
