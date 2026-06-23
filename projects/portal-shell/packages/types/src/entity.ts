// ---------------------------------------------------------------------------
// Entity switcher domain types
// ---------------------------------------------------------------------------

export interface LinkedEntity {
  id: string;
  name: string;
  /** e.g. "Manufacturing", "Healthcare" */
  subType: string;
  logoUrl: string | null;
}
