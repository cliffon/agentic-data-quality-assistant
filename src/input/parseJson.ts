import { InputError } from "./errors.js";

export function parseJson(text: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new InputError(`Body is not valid JSON: ${(e as Error).message}`);
  }
  return ensureArray(parsed);
}

export function ensureArray(parsed: unknown): unknown[] {
  if (!Array.isArray(parsed)) throw new InputError("Expected a JSON array of item records.");
  return parsed;
}
