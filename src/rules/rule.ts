import type { Dataset, ReviewCandidate } from "../domain/types.js";

/** A deterministic check: pure, synchronous, same input -> same output, never mutates the dataset. */
export interface Rule {
  readonly id: string;
  readonly version: number;
  run(dataset: Dataset): ReviewCandidate[];
}
