import { duplicateItemId } from "./duplicateItemId.js";
import { malformedRow } from "./malformedRow.js";
import { missingPartNumber } from "./missingPartNumber.js";
import type { Rule } from "./rule.js";
import { unsupportedUom } from "./unsupportedUom.js";
import { weakDescription } from "./weakDescription.js";

export const DETERMINISTIC_RULES: readonly Rule[] = [
  malformedRow,
  missingPartNumber,
  weakDescription,
  duplicateItemId,
  unsupportedUom,
];
