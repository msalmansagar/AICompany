/**
 * qdb-status-codes.mjs
 *
 * ⚠️  AUTHORED, NOT PROVISIONED. Nothing in this file has been executed against any CRM
 *     organisation. Running provisioning requires explicit user go-ahead, every time.
 *
 * Custom statuscode values for `qdb_collectioncase` and `qdb_collectionactivity`.
 * Provisioned with the InsertStatusValue OData action, which works on both Dynamics 365 CE 9.x
 * on-premises and Dataverse.
 *
 * 🔴 STATE ASSIGNMENT IS THE ORGANISATION'S REAL CONVENTION, NOT A CRM DEFAULT.
 * Only **Closed** and **Written Off** are statecode 1 (Inactive). Settled, Under Legal Action and
 * Deceased/Insurance Review are statecode **0 (Active)** even though they read like endings. This
 * is deliberate and must not be "corrected": `FindActiveCases` genuinely returns Settled cases, so
 * the skip-list in `StopContactQueueMover` is load-bearing. Verified against the deployed
 * `msst_dcpcollectioncase` option-set definition, not assumed from CRM convention.
 *
 * 🔴 Option values are publisher-bound and are resolved from the qdb publisher's OptionValuePrefix
 * at provisioning time — the `msst_` integers (463 27x xxx) cannot be reused. Migration between the
 * two schemas maps by LABEL, never by integer.
 *
 * PTP is no longer an entity with its own statuscodes: it is an activity TYPE, and its lifecycle
 * lives in the `qdb_ptp_status` choice (see qdb-option-set-defs.mjs).
 */
import { resolveQdbOptionValueBase, QDB_OPTION_BLOCKS } from './qdb-option-set-defs.mjs';

/** statuscode blocks, offset from the publisher base (kept clear of the global-choice blocks). */
const STATUS_BLOCK = {
  CASE:     600,
  ACTIVITY: 640,
};

/**
 * The 17 Collection Case status reasons, in lifecycle order.
 * `state` 0 = Active, 1 = Inactive. See the warning above before changing any of these.
 */
const CASE_STATUS_LABELS = [
  { label: 'New',                        state: 0 },
  { label: 'Assigned',                   state: 0 },
  { label: 'In Progress',                state: 0 },
  { label: 'Pending Customer Response',  state: 0 },
  { label: 'PTP Active',                 state: 0 },
  { label: 'PTP Broken',                 state: 0 },
  { label: 'Restructure Review',         state: 0 },
  { label: 'Restructured',               state: 0 },
  { label: 'Escalated to Supervisor',    state: 0 },
  { label: 'Pending Legal Review',       state: 0 },
  { label: 'Referred to Legal',          state: 0 },
  { label: 'Under Legal Action',         state: 0 },
  { label: 'Deceased/Insurance Review',  state: 0 },
  { label: 'Settled',                    state: 0 },
  { label: 'Closed',                     state: 1 },
  { label: 'Written Off',                state: 1 },
  { label: 'Reopened',                   state: 0 },
];

/**
 * Collection Activity status reasons.
 * Activity entities use statecode 0 = Open, 1 = Completed, 2 = Canceled — a platform convention,
 * unlike the case states above.
 */
const ACTIVITY_STATUS_LABELS = [
  { label: 'Open',              state: 0 },
  { label: 'In Progress',       state: 0 },
  { label: 'Awaiting Approval', state: 0 },
  { label: 'Returned',          state: 0 },
  { label: 'Completed',         state: 1 },
  { label: 'Cancelled',         state: 2 },
];

/**
 * Builds the statuscode entries for an entity, offsetting each value from the publisher base.
 * @param {number} base @param {number} blockStart @param {{label:string,state:number}[]} labels
 */
function statusEntries(base, blockStart, labels) {
  return labels.map(({ label, state }, i) => ({ value: base + blockStart + i, state, label }));
}

/**
 * All qdb_ statuscode definitions.
 * @param {number} [base] publisher option-value base; defaults to the environment-resolved value
 */
export function buildQdbStatusCodes(base = resolveQdbOptionValueBase()) {
  return [
    {
      entity: 'qdb_collectioncase',
      attribute: 'statuscode',
      values: statusEntries(base, STATUS_BLOCK.CASE, CASE_STATUS_LABELS),
    },
    {
      entity: 'qdb_collectionactivity',
      attribute: 'statuscode',
      values: statusEntries(base, STATUS_BLOCK.ACTIVITY, ACTIVITY_STATUS_LABELS),
    },
  ];
}

/**
 * Labels in lifecycle order — the migration handle between `msst_` and `qdb_` (map by label, never
 * by integer) and the source of truth for the C# StatusTransitionMatrix constants, which must be
 * re-read from provisioned metadata before the plugin assembly is registered.
 */
export const QDB_CASE_STATUS_LABELS = CASE_STATUS_LABELS.map(s => s.label);
export const QDB_ACTIVITY_STATUS_LABELS = ACTIVITY_STATUS_LABELS.map(s => s.label);

/** Case statuses that are Active despite reading like endings — the load-bearing skip-list. */
export const QDB_ACTIVE_BUT_TERMINAL_LOOKING = ['Settled', 'Under Legal Action', 'Deceased/Insurance Review'];

export { STATUS_BLOCK as QDB_STATUS_BLOCKS, QDB_OPTION_BLOCKS };
