import { collapseSpaces } from "../normalize/text.js";
import type { Suggester } from "./suggester.js";

/**
 * SIMULATED AI. No model is called. This is a deterministic stand-in that follows the same contract a
 * real LLM suggester would, so the surrounding safety design (minimized input, untrusted output,
 * validation, human review) is real and testable. It only collapses whitespace and expands a few
 * abbreviations. It never changes casing, because that would corrupt units and part numbers.
 */
const ABBREVIATIONS: Record<string, string> = { brg: "Bearing", vlv: "Valve", conn: "Connector", assy: "Assembly", "w/": "with" };

export const stubSuggester: Suggester = {
  name: "stub-normalizer-v2 (simulated, no model)",
  async suggest(inputs) {
    return inputs.flatMap((i) => {
      const suggested = collapseSpaces(i.item_description)
        .split(" ")
        .map((w) => ABBREVIATIONS[w.toLowerCase()] ?? w)
        .join(" ");
      if (suggested === i.item_description.trim()) return [];
      return [{ row_index: i.row_index, suggested_value: suggested, rationale: "Whitespace and known abbreviations normalized.", confidence: 0.6 }];
    });
  },
};
