import { MANUFACTURER_NOISE_WORDS } from "../config/businessConfig.js";

const NOISE = new Set(MANUFACTURER_NOISE_WORDS);

/** "6205-ZZ", "6205 zz", "6205ZZ" all become "6205ZZ". Callers must also match manufacturer. */
export function normalizeMpn(mpn: string): string {
  return mpn.toUpperCase().replace(/[\s\-_./]+/g, "");
}

/** "SKF India" -> "SKF", "Schneider Electric" -> "SCHNEIDER". Noise words are only dropped if something remains. */
export function normalizeManufacturer(m: string): string {
  const words = m.toUpperCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
  const kept = words.filter((w) => !NOISE.has(w));
  return (kept.length > 0 ? kept : words).join("");
}
