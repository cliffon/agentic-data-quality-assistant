import { readFileSync } from "node:fs";
import { stubSuggester } from "../src/ai/stubSuggester.js";
import { analyze } from "../src/pipeline/analyze.js";

const file = process.argv[2] ?? "test/fixtures/demo-input.json";
const rows = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
const { summary, candidates, warnings } = await analyze(rows, stubSuggester);

console.log("(row numbers are 1-based, as in the explanations; the JSON field row_index is 0-based)");
for (const [i, row] of rows.entries()) {
  const mine = candidates.filter((c) => c.row_index === i);
  console.log(`\nrow ${i + 1}  id=${String(row?.["item_id"])}  "${String(row?.["item_description"]).trim()}"  [${String(row?.["source_system"] ?? "-")}]`);
  if (mine.length === 0) console.log("   no candidates");
  for (const c of mine) {
    console.log(`   ${c.severity.toUpperCase().padEnd(6)} ${c.confidence.toFixed(2)}  ${c.source.padEnd(21)} ${c.issue_type}`);
    console.log(`          ${c.explanation}`);
    console.log(`          -> ${c.suggested_action}`);
  }
}
console.log(`\n${summary.total_rows} rows, ${summary.total_candidates} candidates on ${summary.rows_with_candidates} rows`);
console.log("by severity:", summary.by_severity, " by source:", summary.by_source);
for (const w of warnings) console.log("warning:", w);
console.log("All candidates need human review; no input record was changed.");
console.log("Note: the AI-assisted layer is simulated (deterministic stub, no model is called).");
