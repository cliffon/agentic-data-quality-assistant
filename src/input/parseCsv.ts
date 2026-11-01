import { parse } from "csv-parse/sync";
import { InputError } from "./errors.js";

/**
 * Header row + data rows -> array of objects. A row whose column count differs from the header
 * is returned as a raw array so toRecords reports it as malformed instead of failing the upload.
 */
export function parseCsv(text: string): unknown[] {
  let rows: string[][];
  try {
    rows = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: false,
    }) as string[][];
  } catch (e) {
    throw new InputError(`Body is not valid CSV: ${(e as Error).message}`);
  }
  const [header, ...data] = rows;
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return data.map((cells) => {
    if (cells.length !== names.length) return cells;
    const obj: Record<string, string> = {};
    names.forEach((name, i) => {
      obj[name] = cells[i] ?? "";
    });
    return obj;
  });
}
