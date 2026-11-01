import { z } from "zod";
import { DETECTION_SOURCES, ISSUE_TYPES, SEVERITIES } from "./types.js";

export const reviewCandidateSchema = z.object({
  candidate_id: z.string().min(1),
  item_id: z.string().nullable(),
  row_index: z.number().int().nonnegative(),
  source_system: z.string().nullable(),
  issue_type: z.enum(ISSUE_TYPES),
  severity: z.enum(SEVERITIES),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1),
  suggested_action: z.string().min(1),
  source: z.enum(DETECTION_SOURCES),
  rule_id: z.string(),
  rule_version: z.number().int(),
  evidence: z.object({
    fields: z.array(z.string()).optional(),
    observed: z.record(z.string(), z.unknown()).optional(),
    related_item_ids: z.array(z.string()).optional(),
    related_row_indexes: z.array(z.number().int()).optional(),
    suggested_value: z.string().optional(),
    score_breakdown: z.record(z.string(), z.unknown()).optional(),
  }),
  review_status: z.literal("needs_review"),
});
