import type { Dataset } from "../src/domain/types.js";
import { toDataset } from "../src/input/toRecords.js";

export const rec = (o: Record<string, unknown> = {}) => ({
  item_id: "1",
  item_description: "SKF Bearing 6205 ZZ",
  manufacturer: "SKF",
  manufacturer_part_number: "6205-ZZ",
  category: "Mechanical",
  unit_of_measure: "EA",
  source_system: "ERP-A",
  ...o,
});

export const ds = (rows: unknown[]): Dataset => toDataset(rows);
export const types = (cs: { issue_type: string }[]) => cs.map((c) => c.issue_type);
