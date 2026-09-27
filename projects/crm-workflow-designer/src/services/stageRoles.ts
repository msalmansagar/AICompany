/**
 * Role hints parsed from step names (CWFD-009 P5/P9).
 *
 * Real processes carry their organisation in their step names — "EPD Head
 * Review & Approve", "Return to FFD by RM" — and that is often the only
 * grouping signal available, since assignment data can be empty (the Loan
 * spec ships 28 unassigned steps). The patterns are ordered: the most
 * specific actor wins, so "Return to RM by EPD Head" belongs to EPD, not RM.
 */

export interface RolePattern {
  pattern: RegExp;
  role: string;
}

const ROLE_PATTERNS: RolePattern[] = [
  { pattern: /\bCEO\b/i, role: 'CEO' },
  { pattern: /director/i, role: 'Directors' },
  { pattern: /\bEPD\b/i, role: 'EPD' },
  { pattern: /technical/i, role: 'Technical' },
  { pattern: /\bFFD\b|forecast/i, role: 'Financial Forecasting' },
  { pattern: /\bBFD\b/i, role: 'BFD' },
  { pattern: /credit/i, role: 'Credit' },
  { pattern: /\bRM\b|proposal|customer/i, role: 'Relationship Manager' },
];

/** The role a step name suggests, or null when nothing matches. */
export function roleOfStepName(name: string): string | null {
  for (const { pattern, role } of ROLE_PATTERNS) {
    if (pattern.test(name)) return role;
  }
  return null;
}
