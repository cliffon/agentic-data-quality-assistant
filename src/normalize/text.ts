import { PLACEHOLDER_VALUES } from "../config/businessConfig.js";

const PLACEHOLDERS = new Set(PLACEHOLDER_VALUES);

/** Single definition of "blank" for every rule: null, undefined, whitespace, placeholder text. */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const s = String(value).trim().toLowerCase();
  return s === "" || PLACEHOLDERS.has(s);
}

export function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** Tokens for comparing two descriptions: "M10 x 50" and "M10x50" become the same token. */
export function matchTokens(s: string): string[] {
  return tokenize(s.replace(/(\d)\s*[x\u00d7]\s*(?=\d)/gi, "$1x"));
}
