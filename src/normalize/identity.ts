/** Same item_id inside the same source system (trim, case-insensitive). Shared by the key-collision rule and the duplicate heuristic. */
export function itemIdentityKey(r: { source_system: string | null; item_id: string }): string {
  return `${(r.source_system ?? "").trim().toLowerCase()}\u0000${r.item_id.trim().toLowerCase()}`;
}
