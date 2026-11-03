/**
 * status-codes.mjs
 * Provisions custom statuscode values for collection case and PTP record.
 * Uses the InsertStatusValue OData action (works on both on-prem 9.x and Dataverse).
 */
import { apiGet, apiPost } from './crm-client.mjs';
import { label1033 } from './labels.mjs';
import { BASE } from './option-set-defs.mjs';

const b = (offset) => BASE + offset;

// ── Collection case statuscode values (FR-022) ────────────────────────────────
// All 17 values under statecode 0 (Active). Values start at b(200).
const CASE_STATUS_CODES = [
  { value: b(200), state: 0, label: 'New' },
  { value: b(201), state: 0, label: 'Assigned' },
  { value: b(202), state: 0, label: 'In Progress' },
  { value: b(203), state: 0, label: 'Pending Customer Response' },
  { value: b(204), state: 0, label: 'PTP Active' },
  { value: b(205), state: 0, label: 'PTP Broken' },
  { value: b(206), state: 0, label: 'Restructure Review' },
  { value: b(207), state: 0, label: 'Restructured' },
  { value: b(208), state: 0, label: 'Escalated to Supervisor' },
  { value: b(209), state: 0, label: 'Pending Legal Review' },
  { value: b(210), state: 0, label: 'Referred to Legal' },
  { value: b(211), state: 0, label: 'Under Legal Action' },
  { value: b(212), state: 0, label: 'Deceased/Insurance Review' },
  { value: b(213), state: 0, label: 'Settled' },
  { value: b(214), state: 1, label: 'Closed' },
  { value: b(215), state: 1, label: 'Written Off' },
  { value: b(216), state: 0, label: 'Reopened' },
];

// ── PTP record statuscode values (FR-059; matrix in appendix §B.2) ────────────
const PTP_STATUS_CODES = [
  { value: b(220), state: 0, label: 'Open' },
  { value: b(221), state: 1, label: 'Kept' },
  { value: b(222), state: 0, label: 'Partially Kept' },
  { value: b(223), state: 0, label: 'Broken' },
  { value: b(224), state: 0, label: 'Rescheduled' },
  { value: b(225), state: 1, label: 'Cancelled' },
];

/**
 * Checks whether a statuscode value already exists for an entity attribute.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @param {string} entityLogicalName @param {number} value
 * @returns {Promise<boolean>}
 */
export async function statusValueExists(cfg, token, solutionName, entityLogicalName, value) {
  const path = `/EntityDefinitions(LogicalName='${entityLogicalName}')`
    + `/Attributes(LogicalName='statuscode')/Microsoft.Dynamics.CRM.StatusAttributeMetadata/OptionSet`;
  const result = await apiGet(cfg, token, solutionName, path);
  return (result?.Options ?? []).some(opt => opt.Value === value);
}

/**
 * Inserts a single statuscode value via the InsertStatusValue action.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @param {string} entityLogicalName @param {{ value: number, state: number, label: string }} entry
 */
export async function insertStatusValue(cfg, token, solutionName, entityLogicalName, entry) {
  await apiPost(cfg, token, solutionName, '/InsertStatusValue', {
    EntityLogicalName:    entityLogicalName,
    AttributeLogicalName: 'statuscode',
    Label:                label1033(entry.label),
    StateCode:            entry.state,
    Value:                entry.value,
  });
}

/**
 * Ensures all custom statuscode values exist for msst_dcpcollectioncase.
 * Returns { created, skipped } counts.
 * @param {object} cfg @param {string} token @param {string} solutionName
 */
async function ensureStatusCodes(cfg, token, solutionName, { entityLogicalName, entries }) {
  let created = 0;
  let skipped = 0;
  for (const entry of entries) {
    if (await statusValueExists(cfg, token, solutionName, entityLogicalName, entry.value)) skipped++;
    else { await insertStatusValue(cfg, token, solutionName, entityLogicalName, entry); created++; }
  }
  console.log(`  [STATUS CODES] ${entityLogicalName}: ${created} created, ${skipped} skipped`);
  return { created, skipped };
}

/** Ensures all custom statuscode values exist for msst_dcpcollectioncase. */
export function ensureCaseStatusCodes(cfg, token, solutionName) {
  return ensureStatusCodes(cfg, token, solutionName, { entityLogicalName: 'msst_dcpcollectioncase', entries: CASE_STATUS_CODES });
}

/** Ensures all custom statuscode values exist for msst_dcpptprecord. */
export function ensurePtpStatusCodes(cfg, token, solutionName) {
  return ensureStatusCodes(cfg, token, solutionName, { entityLogicalName: 'msst_dcpptprecord', entries: PTP_STATUS_CODES });
}

// A state's DefaultStatus cannot be set through the Web API (UpdateStateValue has no such
// parameter and a metadata PUT is accepted but ignored, verified 2026-09-15). New records therefore
// arrive with statuscode 1; the DefaultStatusAssigner plugin sets New / Open on Create instead.
