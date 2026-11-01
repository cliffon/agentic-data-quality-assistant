# Item Master Data-Quality Assistant (review-candidate slice)

Takes uploaded item-master records (JSON or CSV) and returns **review candidates** for a human data steward.
It never modifies, fixes or approves anything: every candidate has `review_status: "needs_review"`.

> **The AI-assisted layer is simulated.** No model is called and no AI service is used. `src/ai/stubSuggester.ts` is a deterministic stand-in (whitespace cleanup and a few abbreviation expansions) behind the same `Suggester` interface and validation boundary a real LLM would use. Its candidates are labelled `ai_assisted_simulated`. It shows the integration and safety design, not what a real model would find.

## Run
```
npm install            # note: .npmrc points at public npm for this folder
npm run typecheck && npm test
npm run dev            # http://127.0.0.1:3000  (PORT to override)

npm run demo           # readable walk-through of test/fixtures/demo-input.json (10 rows, all 9 issue types)

curl -s -X POST localhost:3000/v1/analyze -H 'content-type: application/json' --data @test/fixtures/demo-input.json
curl -s -X POST localhost:3000/v1/analyze -H 'content-type: text/csv' --data-binary @test/fixtures/sample.csv
```
`POST /v1/analyze` → `200 { summary, candidates, warnings }`; `400 {error:"invalid_input"}` for unparseable body / non-array JSON / broken CSV; `413` over 1 MB; `415` other content types. A single bad *row* is a `malformed_row` candidate, never an HTTP error. `GET /health`.

## Checks
| issue_type | source | rule |
|---|---|---|
| `missing_part_number` | deterministic (DQ-001) | manufacturer present, MPN blank |
| `weak_description` | deterministic (DQ-002) | no / one meaningful word, <4 chars, only generic words, or under 3 words with no size/rating/part number |
| `duplicate_item_id` | deterministic (DQ-003) | same item_id twice within one source system |
| `unsupported_unit_of_measure`, `missing_unit_of_measure` | deterministic (DQ-005) | outside allowlist (aliases like `Each` accepted) / blank |
| `malformed_row` | deterministic (DQ-007) | not an object, blank `item_id`/`item_description`, wrong types |
| `possible_duplicate` | heuristic (H-001) | same manufacturer + normalized MPN (`6205-ZZ` = `6205 zz`); weaker match on description similarity when an MPN is missing. One candidate per row per group; lists up to 10 other records (most similar first) and reports the true total |
| `category_mismatch_candidate` | heuristic (H-002) | description keywords point at exactly one category group and the record's category is a known label of a *different* group. Unknown labels are never judged |
| `normalized_description_suggestion` | **simulated** AI (A-001) | stub suggester (whitespace + abbreviations only, never casing); output passes a validation boundary |

Severity/confidence live in [src/policy.ts](src/policy.ts). Deterministic = fixed confidence; heuristic confidence is computed from evidence that is included in the candidate.

## Layout
`src/input` parse + coerce · `src/normalize` blank/MPN/UoM helpers · `src/rules` deterministic · `src/heuristics` heuristic · `src/ai` Suggester interface, stub, **validateSuggestions** (trust boundary) · `src/pipeline/analyze.ts` orchestration · `src/api` Fastify.
Input is deep-cloned and frozen before analysis, so a rule that writes to a record throws in tests; a test also deep-compares input before/after.

## Real LLM later
Implement `Suggester` over an LLM client. Send only the minimized projection (`row_index`, description, manufacturer, category). Its output is untrusted: `validateSuggestions` enforces schema, known row, length, confidence cap (0.6), and sets `source`/`severity` itself. Failures degrade to a `warnings` entry. Log model, prompt version, input hash and output for audit.

## Needs business verification
All of these live in one file, [src/config/businessConfig.ts](src/config/businessConfig.ts), as best guesses taken from sample data. None should go live before the data owners confirm them. If there are specific measurements, master lists or naming rules, they go in that file.

| Setting | What we assumed | What the 50-row sample showed | Ask the business |
|---|---|---|---|
| Unit of measure list | 14 units plus aliases for abbreviations of supported units (`LTR`, `MTR`, `MTRS`, ...) | `CAN`, `NOS`, `KIT`, `BTL`, `DOZEN`, `SQM` are flagged. They look like real units | Which are valid? Is `NOS` the same as `EA`? Provide the UoM master list |
| Category taxonomy | Two groups (Mechanical, Electrical) with the labels seen in the sample | Labels like PPE, Lubricants, Automotive are not judged at all | The real taxonomy and which keywords belong to which category |
| Manufacturer naming | Words like India, Electric, Ltd are ignored when comparing makers | Fixes SKF vs SKF India and Schneider Electric vs SCHNEIDER; could wrongly merge different makers | A manufacturer master or alias list |
| Placeholder text | `N/A`, `TBD`, `Unknown`, `Unspecified`, ... count as blank | `Unspecified` manufacturer is now treated as blank | The full list used by the source systems |
| Weak-description threshold | Under 3 descriptive words and no number is weak | "Filter cartridge" is flagged | What a steward needs to identify an item |
| Required fields | `item_id` and `item_description` | | Is that the right minimum? |

## Known gaps (not bugs, need a decision or more data)
- Part numbers that are equivalent under the maker's own naming (e.g. SKF `6205-2Z` = `6205-ZZ`) are not matched. They need manufacturer knowledge.
- Duplicates with conflicting values (different category or unit between two systems) are flagged as duplicates but the conflict is not called out.
- A category label unknown to the config is never judged, so a wrong label such as an air filter under "Automotive" is missed.
- A manufacturer such as "Unspecified" is treated as blank for matching but there is no separate "manufacturer missing" check.

## Assumptions
UoM list, category groups and manufacturer noise words are small, English-only placeholders (see "Needs business verification"). Same `item_id` in different source systems is legitimate. Blank = null / whitespace / `N/A`, `TBD`, `-`, etc. (`isBlank`). Stateless; no approve/reject workflow.

## Not done / risks
No persistence, auth, review workflow or audit store. No real LLM. Weak-match duplicate search still compares every pair within a manufacturer group (output is bounded, compute is O(n²): fine for thousands of rows per manufacturer, not millions). Records with no manufacturer are skipped by the duplicate heuristic. Non-English / abbreviation-heavy text mostly yields no finding rather than a wrong one. Next: real taxonomy and UoM master list, approve/reject endpoints with audit log, multipart upload, LLM behind `Suggester`.
