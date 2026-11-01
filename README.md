# Agentic Data-Quality Assistant

An internal data-quality assistant for item master records. Business users upload records from several systems (ERPs, procurement, warehouse). The assistant finds records that may need cleanup and returns **review candidates**: structured findings that a human data steward can approve, reject or investigate.

**Principles**

- **Suggest, never change.** Every finding has `review_status: "needs_review"`. The assistant never edits, fixes or approves a record, and your input is never modified.
- **Explain every finding.** Each candidate says what was found, why, how confident the system is, and what the reviewer could do next.
- **Keep the sources of a finding apart.** Obvious rule violations, pattern-based guesses and AI suggestions are separate layers, labelled in the output.

> **The AI-assisted layer is simulated.** No model is called and no AI service is used. `src/ai/stubSuggester.ts` is a deterministic stand-in (it removes extra spaces and expands a few abbreviations) behind the same interface and validation a real LLM would use. Its findings are labelled `ai_assisted_simulated`. It demonstrates the integration and safety design, not what a real model would find.

---

## Contents
1. [Run it](#1-run-it)
2. [How it works](#2-how-it-works)
3. [API](#3-api)
4. [Issue types](#4-issue-types)
5. [Severity and confidence](#5-severity-and-confidence)
6. [Business configuration](#6-business-configuration)
7. [Project layout](#7-project-layout)
8. [Testing](#8-testing)
9. [Moving from the simulated AI to a real LLM](#9-moving-from-the-simulated-ai-to-a-real-llm)
10. [Scope](#10-scope)

---

## 1. Run it

Requires Node 20 or newer. The folder's `.npmrc` points npm at the public registry.

**Step 1. Install**
```
npm install
```

**Step 2. Check that everything is healthy**
```
npm run typecheck
npm test
```

**Step 3. See it work (no server needed)**
```
npm run demo
```
Prints a readable walk-through of `test/fixtures/demo-input.json`: 10 records that exercise every issue type, with each finding's explanation and suggested action.

**Step 4. Start the API**
```
npm run dev
```
Listens on `http://127.0.0.1:3000`. Set `PORT` to use another port.

**Step 5. Send records**
```
# JSON
curl -s -X POST localhost:3000/v1/analyze \
  -H 'content-type: application/json' \
  --data @test/fixtures/demo-input.json

# CSV
curl -s -X POST localhost:3000/v1/analyze \
  -H 'content-type: text/csv' \
  --data-binary @test/fixtures/sample.csv
```

---

## 2. How it works

```
upload (JSON / CSV)
   │
   ▼
parse ─────────────► unreadable file?  →  400 error
   │
   ▼
read each row ─────► unusable row?     →  "malformed_row" finding (the run continues)
   │
   ▼
1. Rules         obvious, checkable problems          (deterministic_rule)
2. Heuristics    pattern-based guesses, with evidence (heuristic)
3. Simulated AI  suggestions, validated before use    (ai_assisted_simulated)
   │
   ▼
sort + summarize ──► { summary, candidates, warnings }
```

- Analysis runs on a frozen copy of your rows, so a bug in a rule cannot change your data.
- Results are deterministic: the same input always gives the same output, in the same order, with the same `candidate_id`s.
- If the AI layer fails or returns something invalid, the run still succeeds. The bad output is discarded and a `warnings` entry says so.

---

## 3. API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/analyze` | Analyze records and return review candidates |
| `GET` | `/health` | Liveness check, returns `{ "status": "ok" }` |

### Input

Send either a **JSON array** (`content-type: application/json`) or **CSV** with a header row (`content-type: text/csv`). Maximum body size is 1 MB.

| Field | Required | Notes |
|---|---|---|
| `item_id` | yes | Text or number. A blank or missing id makes the row a `malformed_row` |
| `item_description` | yes | Text. Blank or missing makes the row a `malformed_row` |
| `manufacturer` | no | |
| `manufacturer_part_number` | no | Spelling variants such as `6205-ZZ` and `6205 zz` are treated as the same |
| `category` | no | |
| `unit_of_measure` | no | |
| `source_system` | no | Used to tell a repeated id inside one system from the same id in two systems |

Other fields are ignored. `null`, empty text and placeholder text such as `N/A` or `TBD` all count as "not filled in".

```json
[
  {
    "item_id": "1001",
    "item_description": "bearing",
    "manufacturer": "SKF",
    "manufacturer_part_number": "",
    "category": "Mechanical",
    "unit_of_measure": "EA",
    "source_system": "ERP-A"
  }
]
```

For CSV, column names match the field names above. A row with a different number of columns than the header becomes a `malformed_row` finding.

### Output

```
{
  "summary":    { ...counts... },
  "candidates": [ ...review candidates... ],
  "warnings":   [ ...notes, e.g. discarded AI output... ]
}
```

**`summary`**

| Field | Meaning |
|---|---|
| `total_rows` | Rows received |
| `rows_with_candidates` | Rows that have at least one finding |
| `total_candidates` | Findings returned |
| `by_severity` | Counts of `high`, `medium`, `low` |
| `by_source` | Counts per detection source |
| `by_issue_type` | Counts per issue type |

**A review candidate**

| Field | Meaning |
|---|---|
| `candidate_id` | Stable id. The same finding gets the same id on every run |
| `item_id`, `source_system` | The record the finding is about (`item_id` is `null` if the row had none) |
| `row_index` | Position of the row in the upload, starting at 0 |
| `issue_type` | What was found. See [Issue types](#4-issue-types) |
| `severity` | `high`, `medium` or `low`: how much it matters |
| `confidence` | 0 to 1: how sure the system is that this is a real issue |
| `explanation` | Why it was flagged, in plain language |
| `suggested_action` | What the reviewer could do |
| `source` | `deterministic_rule`, `heuristic` or `ai_assisted_simulated` |
| `rule_id`, `rule_version` | Which check produced it, for audit |
| `evidence` | What the reviewer needs to decide: `fields`, `observed` values, `related_item_ids`, `suggested_value`, `score_breakdown` (only the parts that apply) |
| `review_status` | Always `needs_review` |

```json
{
  "candidate_id": "92715d760173",
  "item_id": "1001",
  "row_index": 0,
  "source_system": "ERP-A",
  "issue_type": "missing_part_number",
  "severity": "medium",
  "confidence": 0.95,
  "explanation": "Candidate issue detected: manufacturer 'SKF' is present but manufacturer part number is missing.",
  "suggested_action": "Request the manufacturer part number from the source owner.",
  "source": "deterministic_rule",
  "rule_id": "DQ-001",
  "rule_version": 1,
  "evidence": {
    "fields": ["manufacturer", "manufacturer_part_number"],
    "observed": { "manufacturer": "SKF", "manufacturer_part_number": "" }
  },
  "review_status": "needs_review"
}
```

### Errors

| Status | When | Body |
|---|---|---|
| `400` | Body is not valid JSON or CSV, or JSON is not an array | `{ "error": "invalid_input", "detail": "..." }` |
| `413` | Body larger than 1 MB | `{ "error": "payload_too_large" }` |
| `415` | Any content type other than JSON or CSV | `{ "error": "bad_request" }` |
| `404` | Unknown path | `{ "error": "not_found" }` |
| `500` | Unexpected failure | `{ "error": "internal_error" }` (no stack trace is returned) |

A single bad row never causes an error response. It becomes a `malformed_row` finding.

---

## 4. Issue types

A finding comes from one of three layers. The layer tells the reviewer how much to trust it.

| Layer (`source`) | What it is | How to read it |
|---|---|---|
| `deterministic_rule` | A plain, checkable fact about the record | Almost always correct. Confidence is fixed |
| `heuristic` | A pattern-based guess, with the evidence shown | Worth a look. Confidence is computed from the evidence |
| `ai_assisted_simulated` | A suggested rewrite (simulated, see top of this file) | Only a suggestion. Never applied automatically |

### Layer 1: rules (`deterministic_rule`)

| Rule | `issue_type` | What it means | Triggered when | Severity | Confidence |
|---|---|---|---|---|---|
| DQ-001 | `missing_part_number` | The maker is known but the part number is missing | `manufacturer` is filled and `manufacturer_part_number` is blank | medium | 0.95 |
| DQ-002 | `weak_description` | The description is too vague to identify the item | No words, fewer than 4 characters, only generic words (e.g. "bearing"), one word, or fewer than 3 words with no size, rating or part number | medium | 0.85 |
| DQ-003 | `duplicate_item_id` | The same id is used twice in one system | Same `item_id` more than once within the same `source_system` | high | 0.99 |
| DQ-005 | `unsupported_unit_of_measure` | The unit is not recognised | `unit_of_measure` is filled but not in the supported list | medium | 0.90 |
| DQ-005 | `missing_unit_of_measure` | No unit given | `unit_of_measure` is blank | low | 0.90 |
| DQ-007 | `malformed_row` | The row cannot be used as a record | Not an object, or `item_id` / `item_description` blank, or a field has an unusable type | high | 1.00 |

The same `item_id` in two *different* source systems is normal and is not flagged.

### Layer 2: heuristics (`heuristic`)

| Rule | `issue_type` | What it means | Triggered when | Severity | Confidence |
|---|---|---|---|---|---|
| H-001 | `possible_duplicate` (strong) | Records that probably describe the same item | Same manufacturer and the same part number once spelling is normalised | medium | 0.80, or 0.90 if the descriptions are also similar |
| H-001 | `possible_duplicate` (weak) | Records that might be the same item, but a part number is missing | Same manufacturer, a part number missing on at least one side, and nearly identical descriptions | low | 0.55 |
| H-002 | `category_mismatch_candidate` | The description points to a different category than the one recorded | Description keywords point to one category group and the record's category belongs to a different group | low | 0.70, plus 0.05 per extra keyword (max 0.85) |

How duplicates are reported:

- One finding per record, not per pair. It lists up to 10 other matching records (most similar first) and gives the true total in `evidence.score_breakdown.matching_records`.
- Records with the same `item_id` in the same system are covered by `duplicate_item_id` and do not get a second finding.
- `evidence.related_item_ids` and `related_row_indexes` tell the reviewer where to look.

How the category check stays conservative: it only flags a mismatch when it knows both sides. A category label it has never been told about is not judged.

### Layer 3: simulated AI (`ai_assisted_simulated`)

| Rule | `issue_type` | What it means | Triggered when | Severity | Confidence |
|---|---|---|---|---|---|
| A-001 | `normalized_description_suggestion` | A cleaner wording is suggested | The description has extra spaces or a known abbreviation (e.g. `brg`) | low | at most 0.60 |

The suggestion is in `evidence.suggested_value`. The original description is never changed.

---

## 5. Severity and confidence

Every finding carries two separate scores.

- **Severity** is how much the issue matters to the business: `high` (blocks trust in the record), `medium` (should be fixed), `low` (worth a look).
- **Confidence** is how sure the system is that the finding is real, from 0 to 1.

A low-severity finding can be very certain, and a high-severity one can be uncertain. They are set independently.

### Where the numbers come from
All of them are in one file, [`src/policy.ts`](src/policy.ts), so there is a single place to read and change them.

| Layer | How confidence is set |
|---|---|
| Rules | A fixed number per issue type. These are checkable facts, so they are high (0.85 to 1.00) |
| Heuristics | A base number, adjusted by evidence the reviewer can see: description similarity for duplicates, the number of matching keywords for categories. The evidence is included in the finding |
| AI-assisted | Capped at 0.60 and never higher than `medium` severity, whatever the AI layer claims. The system sets source and severity itself, not the AI |

### How to change it
Open `src/policy.ts` and edit the entry for an issue type, for example:

```ts
missing_part_number: { severity: "medium", confidence: 0.95 },   // change either value
possible_duplicate:  { severity: "medium", baseConfidence: 0.8, withSimilarDescription: 0.9 },
```

Other values in the same file:

| Setting | Effect |
|---|---|
| `possible_duplicate_no_mpn.minSimilarity` | How alike two descriptions must be for the weak duplicate match |
| `DESCRIPTION_SIMILARITY_THRESHOLD` | When descriptions count as "also similar" for the stronger duplicate confidence |
| `MAX_RELATED_RECORDS` | How many other records a duplicate finding lists |
| `AI_CONFIDENCE_CAP`, `AI_MAX_SUGGESTION_LENGTH` | Limits applied to AI-assisted suggestions |

After a change, run `npm test`. Tests that check exact scores will tell you what moved.

Good practice: change these together with the stewards, using their accept/reject decisions to see which findings deserve higher or lower confidence.

---

## 6. Business configuration

Some behaviour depends on how the business names and classifies things, not on programming. All of it is in one file, [`src/config/businessConfig.ts`](src/config/businessConfig.ts). Rules read from it and contain no business vocabulary themselves.

**The current values are starting points taken from sample data. Confirm them with the data owners before real use.** If there are specific lists, measurements or naming rules, add them to this file.

| Setting | What it controls | Current default | Confirm with |
|---|---|---|---|
| `SUPPORTED_UOM` | Units accepted as valid | `EA, PC, BOX, PK, SET, PR, KG, G, LB, M, FT, L, ML, ROLL` | Owner of the UoM master list |
| `UOM_ALIASES` | Other spellings that map to a supported unit, accepted without a finding | `EACH`, `PCS`, `PAIR`, `LTR`, `MTR`, `MTRS`, `KGS`, ... | Same owner. Units seen in data but not listed (e.g. `NOS`, `KIT`, `BTL`, `CAN`, `DOZEN`, `SQM`) are flagged until confirmed |
| `CATEGORY_GROUPS` | Which category labels belong together and which description keywords point to each group | Mechanical and Electrical groups, with the labels seen in sample data | Owner of the category taxonomy |
| `MANUFACTURER_NOISE_WORDS` | Words ignored when comparing makers, so "SKF India" equals "SKF" | `INDIA, ELECTRIC, LTD, LIMITED, PVT, INC, CORP, GMBH, ...` | Owner of the manufacturer master |
| `PLACEHOLDER_VALUES` | Text that counts as "not filled in" | `N/A, TBD, UNKNOWN, UNSPECIFIED, NIL, -, ...` | Source-system owners |
| `VAGUE_WORDS`, `STOP_WORDS` | Words that make a description "generic" or are skipped when counting words | `bearing, valve, part, item, misc, ...` | Data stewards |
| `WEAK_DESCRIPTION` | Description thresholds: minimum characters, and minimum words when no number is present | 4 characters, 3 words | Data stewards |

### How to change a setting

1. Open `src/config/businessConfig.ts` and edit the list or value.
2. Run `npm test`.
3. If a golden test fails, check that the new output is what you intended, then update the expected file in `test/fixtures/`.

Examples:

```ts
// Accept NOS as another spelling of "each"
UOM_ALIASES: { ..., NOS: "EA" }

// Treat bolts under "Hardware" as correctly categorised
CATEGORY_GROUPS.Mechanical.labels: [..., "Hardware"]

// Teach the category check a new keyword
CATEGORY_GROUPS.Electrical.keywords: [..., "switchgear"]
```

---

## 7. Project layout

```
.
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── scripts/
│   └── demo.ts                    readable walk-through for `npm run demo`
├── src/
│   ├── index.ts                   starts the HTTP server
│   ├── policy.ts                  severity and confidence numbers
│   ├── config/
│   │   └── businessConfig.ts      units, categories, manufacturer words, thresholds
│   ├── api/
│   │   └── server.ts              routes, content types, error responses
│   ├── input/                     turn an upload into records
│   │   ├── parseJson.ts
│   │   ├── parseCsv.ts
│   │   ├── toRecords.ts           row → record, or "malformed" with reasons
│   │   └── errors.ts
│   ├── normalize/                 shared cleaning helpers
│   │   ├── text.ts                blank detection, word splitting, similarity
│   │   ├── mpn.ts                 part-number and manufacturer normalisation
│   │   ├── uom.ts                 unit normalisation
│   │   └── identity.ts            "same id in same system" key
│   ├── rules/                     layer 1: deterministic rules
│   │   ├── index.ts               ordered list of rules
│   │   ├── rule.ts                the Rule interface
│   │   ├── missingPartNumber.ts
│   │   ├── weakDescription.ts
│   │   ├── duplicateItemId.ts
│   │   ├── unsupportedUom.ts
│   │   └── malformedRow.ts
│   ├── heuristics/                layer 2: pattern-based guesses
│   │   ├── possibleDuplicate.ts
│   │   └── categoryMismatch.ts
│   ├── ai/                        layer 3: simulated AI
│   │   ├── suggester.ts           interface a real model would implement
│   │   ├── stubSuggester.ts       the simulation
│   │   └── validateSuggestions.ts checks every suggestion before it is used
│   ├── pipeline/
│   │   └── analyze.ts             runs the layers, sorts, summarizes
│   └── domain/
│       ├── types.ts               record and candidate types
│       ├── schema.ts              candidate output schema
│       └── candidate.ts           the one place candidates are built
└── test/
    ├── *.test.ts                  unit, scenario, matrix and property tests
    └── fixtures/                  sample, demo and 50-row datasets with expected output
```

---

## 8. Testing

```
npm test            # run all tests
npm run typecheck   # strict TypeScript
```

| Test file | What it covers |
|---|---|
| `normalize`, `toRecords`, `rules`, `heuristics`, `ai` | Each module on its own |
| `matrix` | Every combination of field states for one record, and of relationships between two records |
| `scenarios` | Hand-picked multi-issue cases, odd input and CSV variants |
| `properties` | Shuffling rows changes nothing, runs repeat exactly, input is never modified, large inputs stay bounded |
| `pipeline`, `api` | End to end, including the expected-output files below |

**Datasets with expected output** (in `test/fixtures/`):

| Dataset | Rows | Purpose |
|---|---|---|
| `sample-input.json` | 2 | The two-record example from the brief |
| `demo-input.json` | 10 | One small set that shows every issue type, every layer and every severity. Used by `npm run demo` |
| `external-input.json` | 50 | Realistic mixed data used to check precision and recall |

Each has a matching `*-expected.json` written from the rules, not copied from program output.

---

## 9. Moving from the simulated AI to a real LLM

The seam already exists. A real model would implement the `Suggester` interface in `src/ai/suggester.ts`:

1. **Send as little as possible.** The suggester receives only `row_index`, description, manufacturer and category.
2. **Treat the reply as untrusted.** `validateSuggestions` checks shape, row, length and confidence, and sets source and severity itself.
3. **Fail safe.** If the call fails or times out, the run still returns rule and heuristic findings, plus a warning.
4. **Keep humans in charge.** Suggestions are findings for review, never edits.

Before using a real model, agree what data may leave the company, and log the model, prompt version and output for audit.

---

## 10. Scope

**Included:** the three detection layers, a stateless HTTP API for JSON and CSV, structured explainable output, a business configuration file, and the tests and datasets above.

**Not included:** storing results, an approve/reject workflow, authentication, a user interface, a real AI model, and multipart file upload.
