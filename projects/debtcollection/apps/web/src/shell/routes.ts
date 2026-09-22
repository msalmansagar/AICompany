/**
 * The workspace's 21 views, exactly as the approved prototype defines them.
 *
 * This table is the single source of navigation truth: the nav rail, the router and the RBAC gating
 * all read it, so a view cannot exist in one and be missing from another. Order, grouping, labels,
 * icons, role gates and badge keys are the prototype's — nothing was reordered or renamed.
 *
 * `phase` records who owns the *functionality*. A view owned by a later phase is still present,
 * still navigable and still laid out as designed; it simply says which phase will make it work,
 * rather than pretending or disappearing. That is the UI Requirements Matrix, expressed in code.
 */

import type { IconName } from '../components/icons.js';

export type RoleKey = 'officer' | 'manager' | 'rm' | 'legal';

/** Which phase owns the view's functionality. Phase 5 builds the ones marked 5. */
export type OwningPhase = 5 | 6 | 7 | 8 | 9 | 10;

export interface ViewDefinition {
  /** Stable id, used in the URL hash and by the router. The prototype's own view key. */
  id: string;
  label: string;
  icon: IconName;
  group: 'Workspace' | 'Customer' | 'Strategy' | 'Engagement' | 'Workout' | 'Oversight' | 'Admin';
  /** Absent means every role sees it. */
  roles?: readonly RoleKey[];
  /** Named count this view shows as a badge, when a bounded count is available for it. */
  badge?: 'openQueues' | 'openCases' | 'openPtps' | 'openDisputes' | 'pendingApprovals';
  phase: OwningPhase;
  /** Shown on a future-phase view so the reader knows what it will do, and that it does not yet. */
  pendingSummary?: string;
}

export const VIEWS: readonly ViewDefinition[] = [
  // ── Workspace ──────────────────────────────────────────────────────────────
  { id: 'myday', label: 'My Day', icon: 'home', group: 'Workspace', phase: 5 },
  { id: 'queues', label: 'Work Queues', icon: 'queue', group: 'Workspace', badge: 'openQueues', phase: 5 },
  { id: 'cases', label: 'Collection Cases', icon: 'case', group: 'Workspace', badge: 'openCases', phase: 5 },

  // ── Customer ───────────────────────────────────────────────────────────────
  { id: 'customer', label: 'Customer & Loan 360', icon: 'users', group: 'Customer', phase: 5 },
  { id: 'case', label: 'Case Detail', icon: 'doc', group: 'Customer', phase: 5 },
  { id: 'intake', label: 'Delinquency Intake', icon: 'refresh', group: 'Customer', roles: ['manager'], phase: 5 },

  // ── Strategy ───────────────────────────────────────────────────────────────
  { id: 'buckets', label: 'Segmentation Matrix', icon: 'strategy', group: 'Strategy', phase: 5 },
  {
    id: 'rules', label: 'Strategy Rules', icon: 'settings', group: 'Strategy', roles: ['manager'], phase: 5,
    pendingSummary: 'Rules are readable here. Authoring and publishing belong to Phase 8, and the ' +
      'thresholds themselves live in the QDB Rule Engine rather than in this application.',
  },
  {
    id: 'actionplan', label: 'Action Plan', icon: 'check', group: 'Strategy', phase: 5,
    pendingSummary: 'Every action an active strategy can resolve to is listed here. The plan for one ' +
      'case, and the work attributed to each planned action, are on that case\'s Actions tab.',
  },

  // ── Engagement ─────────────────────────────────────────────────────────────
  {
    id: 'ptp', label: 'Promise to Pay', icon: 'promise', group: 'Engagement', badge: 'openPtps', phase: 5,
    pendingSummary: 'Promises are captured and worked from the case. Reminders need the Phase 7 ' +
      'communication transport, and automatic kept/broken evaluation needs the MIS payment contract.',
  },
  {
    id: 'comms', label: 'Communication', icon: 'send', group: 'Engagement', phase: 7,
    pendingSummary: 'SMS, WhatsApp, email and warning letters are Phase 7. Nothing here sends anything, ' +
      'and no send is simulated.',
  },
  {
    id: 'templates', label: 'Template Library', icon: 'letter', group: 'Engagement', phase: 7,
    pendingSummary: 'Template management arrives with the Communication Centre in Phase 7.',
  },

  // ── Workout ────────────────────────────────────────────────────────────────
  {
    id: 'disputes', label: 'Disputes', icon: 'dispute', group: 'Workout', badge: 'openDisputes', phase: 9,
    pendingSummary: 'A dedicated disputes workspace is Phase 9. Recording a collection dispute is ' +
      'delivered already — log an action on the case and choose the dispute type. A formal complaint ' +
      'is a Case in QDB\'s own complaint process: this workspace shows one and links to it, and ' +
      'raising one is done by the complaints team, not from here.',
  },
  {
    id: 'restructure', label: 'Restructuring', icon: 'restructure', group: 'Workout', phase: 9,
    pendingSummary: 'Restructuring is parked, not cancelled. QDB handles it as Facility Amendment, and the hand-off waits on QDB confirmation (KI-114). A restructuring recommendation raised by an officer appears in Work Queues today.',
  },
  {
    id: 'legal', label: 'Legal Hand-off', icon: 'legal', group: 'Workout', phase: 9,
    pendingSummary: 'A dedicated legal workspace is Phase 9. Following a legal request through ' +
      'QDB\'s own process is delivered already and shown on the case. Sending a case to legal is ' +
      'not available to anyone until QDB defines which cases qualify (KI-109).',
  },
  {
    id: 'claims', label: 'Deceased & Claims', icon: 'shield', group: 'Workout', phase: 9,
    pendingSummary: 'Recording a deceased review is delivered already, on the case\'s Actions tab; ' +
      'it marks an indication to verify, never a confirmed death, and changes nothing else. ' +
      'Insurance claims are not built, because no credit-life process was found to build against ' +
      '(KI-125). The FR-097 contact hold still awaits QDB confirmation of its authoritative source ' +
      '(KI-44).',
  },

  // ── Oversight ──────────────────────────────────────────────────────────────
  {
    id: 'dashboards', label: 'Dashboards', icon: 'chart', group: 'Oversight', phase: 5,
    pendingSummary: 'Bounded operational counts are live. Full dashboards and drilldowns are Phase 10.',
  },
  {
    id: 'mis', label: 'Portfolio MIS', icon: 'trend', group: 'Oversight', roles: ['manager', 'rm'], phase: 10,
    pendingSummary: 'Portfolio MIS needs the QDB MIS transport contract, which does not yet exist (KI-53). ' +
      'Phase 10 owns it.',
  },
  {
    id: 'approvals', label: 'Approvals', icon: 'approve', group: 'Oversight', badge: 'pendingApprovals', phase: 10,
    pendingSummary: 'Approval routing is Phase 10. No entity exists for it yet.',
  },
  { id: 'audit', label: 'Audit Trail', icon: 'audit', group: 'Oversight', phase: 5 },

  // ── Admin ──────────────────────────────────────────────────────────────────
  {
    id: 'admin', label: 'Configuration', icon: 'settings', group: 'Admin', roles: ['manager'], phase: 5,
    pendingSummary: 'Configuration is readable. Publishing, comparison, version history and export ' +
      'belong to Phases 8-10.',
  },
];

/** Nav group order, as the prototype lays them out. */
export const GROUP_ORDER: readonly ViewDefinition['group'][] = [
  'Workspace', 'Customer', 'Strategy', 'Engagement', 'Workout', 'Oversight', 'Admin',
];

export const DEFAULT_VIEW_ID = 'myday';

export function findView(id: string): ViewDefinition | undefined {
  return VIEWS.find(v => v.id === id);
}

/**
 * Which views a role may see.
 *
 * **This is presentation only.** Hiding a view hides a menu entry; it authorises nothing. Every read
 * and write still goes through the CRM session as the signed-in user, and CRM's own role-based
 * security is what actually permits or refuses it. A user who reaches a hidden view by URL sees
 * whatever CRM lets them see — which is the correct outcome, not a bug.
 */
export function viewsForRole(role: RoleKey): readonly ViewDefinition[] {
  return VIEWS.filter(v => v.roles === undefined || v.roles.includes(role));
}

/**
 * Views whose functionality is built, whatever phase owns them.
 *
 * The gate used to be `phase > 5`, which was true while Phase 5 was the frontier and became a lie
 * the moment Phase 7 delivered a screen: the Communication Centre would have kept showing "this
 * arrives in Phase 7" while working. Listing what is implemented keeps the nav rail, the router and
 * the notice telling the same story, and a view is pending until it is named here.
 */
const IMPLEMENTED: ReadonlySet<string> = new Set([
  'myday', 'queues', 'cases', 'case', 'customer', 'intake', 'buckets',
  'rules', 'actionplan', 'ptp', 'dashboards', 'admin', 'audit',
  // Phase 7.
  'comms',
]);

/** True when the view's functionality has not been built yet. */
export function isPending(view: ViewDefinition): boolean {
  return !IMPLEMENTED.has(view.id);
}
