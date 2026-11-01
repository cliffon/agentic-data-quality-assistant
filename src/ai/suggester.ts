/**
 * The seam for a real LLM. A Suggester sees only a minimized projection of each record and returns
 * *untrusted* suggestions; validateSuggestions is the only way they become review candidates.
 */
export interface SuggesterInput {
  /** Opaque key used to map a suggestion back to a row. */
  readonly row_index: number;
  readonly item_description: string;
  readonly manufacturer: string | null;
  readonly category: string | null;
}

export interface Suggester {
  readonly name: string;
  suggest(inputs: readonly SuggesterInput[]): Promise<unknown[]>;
}
