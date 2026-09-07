/**
 * A stable identity colour per step — FlowOn-style: the same accent appears on
 * the card's left bar, the navigator chip and the properties panel header, so
 * "which step am I editing" is answered at a glance. Hashing the CRM id keeps
 * a step's colour stable across reorders and sessions.
 */
const STEP_ACCENT_CYCLE = [
  'var(--primary)',
  'var(--accent-branch)',
  'var(--accent-route)',
  'var(--accent-user)',
  'var(--accent-team)',
  'var(--accent-roundrobin)',
] as const;

export function stepAccent(stepId: string): string {
  let hash = 0;
  for (let i = 0; i < stepId.length; i++) {
    hash = (hash * 31 + stepId.charCodeAt(i)) >>> 0;
  }
  return STEP_ACCENT_CYCLE[hash % STEP_ACCENT_CYCLE.length];
}

export { TERMINATING_BADGE_REGISTRATION as TERMINATING_BADGE } from '@/styles/surfacePairs';
