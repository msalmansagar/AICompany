/**
 * option-set-defs.mjs
 * Global option set definitions for the DCP Phase 1 schema.
 *
 * Option values start at publisher base 46327 × 10 000 = 463 270 000.
 * Each set is allocated 20 values; the range is split into named blocks below.
 */
import { label1033, emptyLabel, optionItem } from './labels.mjs';

const BASE = 463270000;
const b = (offset) => BASE + offset;

/** @param {string} name @param {string} displayName @param {Array<{value:number,label:string}>} items */
function defOptionSet(name, displayName, items) {
  return {
    name,
    definition: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      OptionSetType: 'Picklist',
      IsGlobal: true,
      Name: name,
      DisplayName: label1033(displayName),
      Description: emptyLabel(),
      Options: items.map(({ value, label }) => optionItem(value, label)),
    },
  };
}

// ── 10 MIS DPD buckets ────────────────────────────────────────────────────────
// The ten MIS buckets of FR-018 — the MIS Middleware API classifies into exactly these.
const DPD_BUCKETS = [
  { value: b(1),  label: '1-30 days' },
  { value: b(2),  label: '31-60 days' },
  { value: b(3),  label: '61-90 days' },
  { value: b(4),  label: '91-180 days' },
  { value: b(5),  label: '181-270 days' },
  { value: b(6),  label: '271-360 days' },
  { value: b(7),  label: '361-500 days' },
  { value: b(8),  label: '501-1000 days' },
  { value: b(9),  label: '1001-2000 days' },
  { value: b(10), label: '>2000 days' },
];

// ── Communication channels ────────────────────────────────────────────────────
const CHANNELS = [
  { value: b(21), label: 'SMS' },
  { value: b(22), label: 'Email' },
  { value: b(23), label: 'Official Letter' },
  { value: b(24), label: 'Call' },
];

// ── Preferred language ────────────────────────────────────────────────────────
const LANG_OPTIONS = [
  { value: b(31), label: 'Arabic' },
  { value: b(32), label: 'English' },
];

// ── Loan product type ─────────────────────────────────────────────────────────
const PRODUCT_TYPES = [
  { value: b(41), label: 'Housing Loan' },
  { value: b(42), label: 'Corporate' },
  { value: b(43), label: 'SME' },
  { value: b(44), label: 'Restructured' },
  { value: b(45), label: 'Legal' },
  { value: b(46), label: 'Deceased' },
];

// ── Account status (NPL/Write-off axis — separate from DPD bucket) ────────────
const ACCOUNT_STATUSES = [
  { value: b(51), label: 'Current' },
  { value: b(52), label: 'Watch List' },
  { value: b(53), label: 'Substandard' },
  { value: b(54), label: 'NPL' },
  { value: b(55), label: 'Write-off' },
];

// ── PDPPL consent status ──────────────────────────────────────────────────────
const CONSENT_STATUSES = [
  { value: b(61), label: 'Given' },
  { value: b(62), label: 'Withdrawn' },
  { value: b(63), label: 'Not Recorded' },
];

// ── Lawful basis (consent) ────────────────────────────────────────────────────
const LAWFUL_BASES = [
  { value: b(71), label: 'Consent' },
  { value: b(72), label: 'Legitimate Interest' },
  { value: b(73), label: 'Legal Obligation' },
];

// ── Action type (config-driven — FR-052) ──────────────────────────────────────
const ACTION_TYPES = [
  { value: b(81), label: 'Call' },
  { value: b(82), label: 'Meeting' },
  { value: b(83), label: 'Supervisor Review' },
  { value: b(84), label: 'Field Visit' },
  { value: b(85), label: 'Manual Note' },
];

// ── Communication delivery status ─────────────────────────────────────────────
const DELIVERY_STATUSES = [
  { value: b(91), label: 'Sent' },
  { value: b(92), label: 'Delivered' },
  { value: b(93), label: 'Failed' },
  { value: b(94), label: 'Opened' },
  { value: b(95), label: 'Blocked' },
];

// ── Communication direction ───────────────────────────────────────────────────
const COMM_DIRECTIONS = [
  { value: b(101), label: 'Inbound' },
  { value: b(102), label: 'Outbound' },
];

// ── Org instance (HL / BFD routing) ──────────────────────────────────────────
const ORG_OPTIONS = [
  { value: b(111), label: 'Housing Loan (HL)' },
  { value: b(112), label: 'BFD' },
];

// ── Identity exception reason ─────────────────────────────────────────────────
const EXCEPTION_REASONS = [
  { value: b(121), label: 'Missing QID' },
  { value: b(122), label: 'Duplicate QID' },
  { value: b(123), label: 'One Org Only' },
];

// ── Identity exception status ─────────────────────────────────────────────────
const EXCEPTION_STATUSES = [
  { value: b(131), label: 'Open' },
  { value: b(132), label: 'Resolved' },
];

// ── PTP record status ─────────────────────────────────────────────────────────
// PTP lifecycle is the statuscode of msst_dcpptprecord (status-codes.mjs), not a picklist.

// ── Strategy action type (incl. NoContact) ────────────────────────────────────
const STRATEGY_ACTION_TYPES = [
  { value: b(151), label: 'SMS' },
  { value: b(152), label: 'Email' },
  { value: b(153), label: 'Official Letter' },
  { value: b(154), label: 'Queue Assignment' },
  { value: b(155), label: 'No Contact' },
];

// ── Segment ───────────────────────────────────────────────────────────────────
const SEGMENTS = [
  { value: b(161), label: 'Retail' },
  { value: b(162), label: 'SME' },
];

// ── Exported definitions ──────────────────────────────────────────────────────

export const OPTION_SET_DEFS = [
  defOptionSet('msst_dcpdpdbucket',           'DCP DPD Bucket',                DPD_BUCKETS),
  defOptionSet('msst_dcpchannel',             'DCP Communication Channel',     CHANNELS),
  defOptionSet('msst_dcppreferredlanguage',   'DCP Preferred Language',        LANG_OPTIONS),
  defOptionSet('msst_dcpproducttype',         'DCP Product Type',              PRODUCT_TYPES),
  defOptionSet('msst_dcpaccountstatus',       'DCP Account Status',            ACCOUNT_STATUSES),
  defOptionSet('msst_dcpconsentstatus',       'DCP Consent Status',            CONSENT_STATUSES),
  defOptionSet('msst_dcplawfulbasis',         'DCP Lawful Basis',              LAWFUL_BASES),
  defOptionSet('msst_dcpactiontype',          'DCP Action Type',               ACTION_TYPES),
  defOptionSet('msst_dcpdeliverystatus',      'DCP Delivery Status',           DELIVERY_STATUSES),
  defOptionSet('msst_dcpcommdirection',       'DCP Communication Direction',   COMM_DIRECTIONS),
  defOptionSet('msst_dcporg',                 'DCP Org Instance',              ORG_OPTIONS),
  defOptionSet('msst_dcpexceptionreason',     'DCP Exception Reason',          EXCEPTION_REASONS),
  defOptionSet('msst_dcpexceptionstatus',     'DCP Exception Status',          EXCEPTION_STATUSES),
  defOptionSet('msst_dcpstrategyactiontype',  'DCP Strategy Action Type',      STRATEGY_ACTION_TYPES),
  defOptionSet('msst_dcpsegment',             'DCP Segment',                   SEGMENTS),
];

// Export option values for use in status-codes.mjs
export { BASE };
