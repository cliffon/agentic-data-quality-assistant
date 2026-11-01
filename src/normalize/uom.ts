import { SUPPORTED_UOM as SUPPORTED, UOM_ALIASES } from "../config/businessConfig.js";

export const SUPPORTED_UOM: ReadonlySet<string> = new Set(SUPPORTED);

/** Upper-cases/trims and applies aliases. Returns the canonical code if supported, else null. */
export function canonicalUom(raw: string): string | null {
  const u = raw.trim().toUpperCase();
  const mapped = UOM_ALIASES[u] ?? u;
  return SUPPORTED_UOM.has(mapped) ? mapped : null;
}
