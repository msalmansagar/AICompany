import type { AssignToType } from '@/types/WorkflowTypes';
import { ASSIGN_TO_LABELS } from '@/services/taskAssignment';

/**
 * The assignment mode as a glyph rather than a word.
 *
 * A card only has ~120px for this chip, so "Read From Parent" and "Apply Round
 * Robin" pushed out the assignee name they were meant to qualify. The four
 * modes are a small closed set, which is exactly what an icon vocabulary is
 * for — and the words stay reachable: every icon carries its label as a
 * tooltip and as its accessible name, and the canvas legend spells all four out.
 *
 * Drawn as inline SVG on `currentColor` so each canvas keeps its own accent
 * and the icon stays crisp at any zoom.
 */

interface IconProps {
  size?: number;
}

function UserIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TeamIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="6" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.8 13c0-2.2 1.9-3.5 4.2-3.5s4.2 1.3 4.2 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11 3.2a2.2 2.2 0 0 1 0 4.1M12.2 9.8c1.3.5 2.2 1.6 2.2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Round robin: the queue handing work on, one member to the next. */
function RoundRobinIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M13.2 6.4A5.2 5.2 0 0 0 3.4 5.2M2.8 9.6a5.2 5.2 0 0 0 9.8 1.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M13.6 3.2v3.4h-3.4M2.4 12.8V9.4h3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Read from parent: the owner comes down from the parent record. */
function ParentIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <rect x="3.4" y="1.6" width="9.2" height="3.6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5.2v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6.1 7.6 8 9.6l1.9-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4.6" y="10.6" width="6.8" height="3.4" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

const ICONS: Record<AssignToType, (props: IconProps) => JSX.Element> = {
  user: UserIcon,
  team: TeamIcon,
  roundRobin: RoundRobinIcon,
  readFromParent: ParentIcon,
};

/**
 * The view canvases carry the org's option-set wording rather than the union,
 * so a label maps back to the mode it names.
 */
export function assignTypeFromLabel(label: string): AssignToType {
  if (label === 'Team') return 'team';
  if (label === 'Round Robin' || label === 'Apply Round Robin') return 'roundRobin';
  if (label === 'Read From Parent') return 'readFromParent';
  return 'user';
}

export function assignLabelOf(type: AssignToType): string {
  return ASSIGN_TO_LABELS[type];
}

/** The four modes in display order, for the legend. */
export const ASSIGN_ICON_ORDER: AssignToType[] = ['user', 'team', 'roundRobin', 'readFromParent'];

export function AssignIcon({ type, size = 12 }: { type: AssignToType; size?: number }) {
  const Icon = ICONS[type] ?? UserIcon;
  return <Icon size={size} />;
}
