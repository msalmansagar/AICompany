// The Dataverse `qdb_priority` column on validation rules and business rules
// enforces a minimum value of 1 (valid range 1–99999). Rules are ordered
// internally with a 0-based `sortOrder`, so the persistence boundary shifts by
// one: sortOrder 0 → priority 1. Without this, the first rule on a field/form
// is rejected with a 400 ("value 0 … is outside the valid range").

/** Converts a 0-based sortOrder to a Dataverse priority (minimum 1). */
export function toDataversePriority(sortOrder: number): number {
  return sortOrder + 1;
}

/** Converts a Dataverse priority (minimum 1) back to a 0-based sortOrder. */
export function fromDataversePriority(priority: number): number {
  return Math.max(0, priority - 1);
}
