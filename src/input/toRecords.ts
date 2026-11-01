import type { Dataset, ItemRecord, MalformedRow } from "../domain/types.js";

const OPTIONAL_FIELDS = [
  "manufacturer",
  "manufacturer_part_number",
  "category",
  "unit_of_measure",
  "source_system",
] as const;

type Coerced = { ok: true; value: string | null } | { ok: false };

/** string stays as-is, number/bigint are stringified, null/undefined are absent, anything else is invalid. */
function coerce(v: unknown): Coerced {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === "string") return { ok: true, value: v };
  if (typeof v === "number" && Number.isFinite(v)) return { ok: true, value: String(v) };
  return { ok: false };
}

/** Reads raw rows into a Dataset. Never mutates or retains-by-reference the raw rows. */
export function toDataset(rows: readonly unknown[]): Dataset {
  const records: ItemRecord[] = [];
  const malformed: MalformedRow[] = [];

  rows.forEach((raw, row_index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      malformed.push({
        row_index,
        raw,
        reasons: [
          Array.isArray(raw)
            ? "Row has the wrong shape: expected named fields (for CSV, the column count must match the header)."
            : "Row is not an object of named fields.",
        ],
      });
      return;
    }
    const obj = raw as Record<string, unknown>;
    const reasons: string[] = [];

    const id = coerce(obj["item_id"]);
    const desc = coerce(obj["item_description"]);
    if (!id.ok) reasons.push("item_id has an unsupported type.");
    else if (id.value === null || id.value.trim() === "") reasons.push("item_id is missing or blank.");
    if (!desc.ok) reasons.push("item_description has an unsupported type.");
    else if (desc.value === null || desc.value.trim() === "") reasons.push("item_description is missing or blank.");

    const optional: Record<string, string | null> = {};
    for (const f of OPTIONAL_FIELDS) {
      const c = coerce(obj[f]);
      if (!c.ok) reasons.push(`${f} has an unsupported type.`);
      else optional[f] = c.value;
    }

    if (reasons.length > 0 || !id.ok || !desc.ok || id.value === null || desc.value === null) {
      malformed.push({ row_index, raw, reasons });
      return;
    }
    records.push({
      row_index,
      item_id: id.value,
      item_description: desc.value,
      manufacturer: optional["manufacturer"] ?? null,
      manufacturer_part_number: optional["manufacturer_part_number"] ?? null,
      category: optional["category"] ?? null,
      unit_of_measure: optional["unit_of_measure"] ?? null,
      source_system: optional["source_system"] ?? null,
    });
  });

  return { records, malformed };
}
