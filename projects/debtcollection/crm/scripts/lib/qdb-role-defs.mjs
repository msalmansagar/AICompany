/**
 * qdb-role-defs.mjs
 *
 * ⚠️  AUTHORED, NOT PROVISIONED. Nothing in this file has been executed against any CRM
 *     organisation. Running provisioning requires explicit user go-ahead, every time.
 *
 * The 12 DCP security roles, renamed `Msst DCP …` → `QDB DCP …` and retargeted at the `qdb_`
 * schema. Created alongside the existing roles (create-new-then-migrate); the `Msst DCP …` roles
 * stay in place until retirement is separately approved.
 *
 * Access model:
 *   C = Create, R = Read, U = Update, with a depth (Basic/Local/Deep/Global).
 *   **Delete is never granted to any role** — enforced here by omission and again by the
 *   ImmutabilityGuard plugin, so removing the privilege is not the only line of defence.
 *
 * CRM native security is the authorisation model (MP §53). React UX security only shapes what is
 * presented and is never a substitute for these privileges.
 *
 * ── What changed from the msst_ role matrix, and why ──────────────────────────
 *  • ACTION + COMM + PTP collapse into ONE entity, `qdb_collectionactivity`: communications are now
 *    the existing `fax` / `email` entities and PTP is an activity type. A role's former
 *    "create actions but only read communications" split can no longer be expressed by entity
 *    privileges alone — see PRIVILEGE_GRANULARITY_NOTE below.
 *  • CUSTOMER / FACILITY privileges are GONE: the masters are `contact` / `account` and the
 *    existing HL/BFD facility entities. Those are QDB-managed system entities and DCP does not
 *    grant privileges on them — a Collection user's access to them is part of the wider QDB
 *    security model. TBD — Requires QDB Confirmation: which existing role grants that read.
 *  • AUDIT is gone: business audit is native Dynamics audit (no entity privilege), and technical
 *    logging is the existing `qdb_crmlogs`, whose privileges belong to QDB, not to DCP. Read on it
 *    is proposed for the support-facing roles only.
 *  • CONFIG splits into the business-configuration entities plus the platform entities.
 */

/** Privilege depths for AddPrivilegesRole. */
export const DEPTH = {
  NONE:   'None',
  BASIC:  'Basic',
  LOCAL:  'Local',
  DEEP:   'Deep',
  GLOBAL: 'Global',
};

/** Entity logical names used in the privilege matrix. */
export const E = {
  CASE:       'qdb_collectioncase',
  ACTIVITY:   'qdb_collectionactivity',
  SNAPSHOT:   'qdb_delinquencysnapshot',
  EXCEPTION:  'qdb_identityexception',
  ACTIVITYTYPE: 'qdb_collectionactivitytype',
  OUTCOME:    'qdb_activityoutcome',
  STRATEGY:   'qdb_collectionstrategy',
  STRATEGYACTION: 'qdb_strategyaction',
  ASSIGNMENT: 'qdb_assignmentconfiguration',
  TEMPLATE:   'qdb_communicationtemplate',
  PLATFORMCONFIG:  'qdb_platformconfiguration',
  PLATFORMMAPPING: 'qdb_platformmapping',
  CONSENT:    'qdb_consent',
  /** EXISTING QDB entity, reused for technical logging — DCP does not create or own it. */
  CRMLOGS:    'qdb_crmlogs',
};

/**
 * Organisation-owned tables accept ONLY Global depth; the platform rejects any other value.
 * Matches the ownership declared in qdb-entity-defs.mjs.
 */
export const ORG_OWNED = new Set([
  E.SNAPSHOT, E.ACTIVITYTYPE, E.OUTCOME, E.STRATEGY, E.STRATEGYACTION,
  E.ASSIGNMENT, E.TEMPLATE, E.PLATFORMCONFIG, E.PLATFORMMAPPING, E.CONSENT,
]);

/**
 * 🔴 PRIVILEGE GRANULARITY NOTE — carried into Phase 1 implementation.
 *
 * ADR-DCP-01 split actions from communications precisely because "may log a call" is not "may send
 * a WhatsApp", and one entity cannot express that in CRM RBAC. Consolidating onto
 * `qdb_collectionactivity` restores that problem in a new place, and the answer is no longer an
 * entity privilege:
 *   • sending is gated by the Communication Service (server-side) against `fax` / `email`
 *     privileges plus the Contact Hold ruleset — not by Collection Activity privileges;
 *   • the "Send Free-Text Message" permission remains a role-claim check, as it was.
 * Recorded so nobody later reads a Create privilege on the activity as permission to send.
 */
export const PRIVILEGE_GRANULARITY_NOTE = 'Send rights are enforced by the Communication Service on fax/email, not by qdb_collectionactivity privileges.';

/** Read-only reference data every Collection role can see. */
const READ_REFERENCE = {
  [E.SNAPSHOT]:     { r: DEPTH.GLOBAL },
  [E.EXCEPTION]:    { r: DEPTH.GLOBAL },
  [E.ACTIVITYTYPE]: { r: DEPTH.GLOBAL },
  [E.OUTCOME]:      { r: DEPTH.GLOBAL },
};

/** @param {object} extra overrides / additions on top of READ_REFERENCE */
function withReference(extra) { return { ...READ_REFERENCE, ...extra }; }

export const QDB_ROLE_DEFS = [
  {
    name: 'QDB DCP Collection Officer',
    privileges: withReference({
      [E.CASE]:     { c: DEPTH.LOCAL, r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTIVITY]: { c: DEPTH.LOCAL, r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.CONSENT]:  {                 r: DEPTH.GLOBAL },
      [E.STRATEGY]: {                 r: DEPTH.GLOBAL },
      [E.STRATEGYACTION]: {           r: DEPTH.GLOBAL },
      [E.TEMPLATE]: {                 r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Relationship Manager',
    privileges: withReference({
      [E.CASE]:     {                 r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTIVITY]: { c: DEPTH.LOCAL, r: DEPTH.GLOBAL },
      [E.CONSENT]:  {                 r: DEPTH.GLOBAL },
      [E.STRATEGY]: {                 r: DEPTH.GLOBAL },
      [E.TEMPLATE]: {                 r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Senior Manager',
    viewPii: true,
    privileges: withReference({
      [E.CASE]:     {                 r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTIVITY]: { c: DEPTH.LOCAL, r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.CONSENT]:  {                 r: DEPTH.GLOBAL },
      [E.STRATEGY]: {                 r: DEPTH.GLOBAL },
      [E.STRATEGYACTION]: {           r: DEPTH.GLOBAL },
      [E.TEMPLATE]: {                 r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Head of Collections',
    viewPii: true,
    privileges: withReference({
      [E.CASE]:     {                 r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTIVITY]: {                 r: DEPTH.GLOBAL },
      [E.CONSENT]:  {                 r: DEPTH.GLOBAL },
      [E.STRATEGY]: {                 r: DEPTH.GLOBAL },
      [E.STRATEGYACTION]: {           r: DEPTH.GLOBAL },
      [E.ASSIGNMENT]: {               r: DEPTH.GLOBAL },
      [E.TEMPLATE]: {                 r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Legal User',
    viewPii: true,
    privileges: withReference({
      [E.CASE]:     {                 r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTIVITY]: { c: DEPTH.LOCAL, r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Insurance Officer',
    viewPii: true,
    privileges: withReference({
      [E.CASE]:     {                 r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTIVITY]: { c: DEPTH.LOCAL, r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Restructuring Officer',
    privileges: withReference({
      [E.CASE]:     {                 r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTIVITY]: { c: DEPTH.LOCAL, r: DEPTH.GLOBAL },
      [E.STRATEGY]: {                 r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Risk Credit User',
    viewPii: true,
    privileges: withReference({
      [E.CASE]:     { r: DEPTH.GLOBAL },
      [E.ACTIVITY]: { r: DEPTH.GLOBAL },
      [E.STRATEGY]: { r: DEPTH.GLOBAL },
      [E.STRATEGYACTION]: { r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Finance User',
    privileges: withReference({
      [E.CASE]:     { r: DEPTH.GLOBAL },
      [E.ACTIVITY]: { r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Admin User',
    privileges: withReference({
      [E.CASE]:       {                 r: DEPTH.GLOBAL },
      [E.ACTIVITY]:   {                 r: DEPTH.GLOBAL },
      [E.CONSENT]:    { c: DEPTH.GLOBAL, r: DEPTH.GLOBAL, u: DEPTH.GLOBAL },
      [E.ACTIVITYTYPE]: { c: DEPTH.GLOBAL, r: DEPTH.GLOBAL, u: DEPTH.GLOBAL },
      [E.OUTCOME]:    { c: DEPTH.GLOBAL, r: DEPTH.GLOBAL, u: DEPTH.GLOBAL },
      [E.STRATEGY]:   { c: DEPTH.GLOBAL, r: DEPTH.GLOBAL, u: DEPTH.GLOBAL },
      [E.STRATEGYACTION]: { c: DEPTH.GLOBAL, r: DEPTH.GLOBAL, u: DEPTH.GLOBAL },
      [E.ASSIGNMENT]: { c: DEPTH.GLOBAL, r: DEPTH.GLOBAL, u: DEPTH.GLOBAL },
      [E.TEMPLATE]:   { c: DEPTH.GLOBAL, r: DEPTH.GLOBAL, u: DEPTH.GLOBAL },
      [E.PLATFORMCONFIG]:  { c: DEPTH.GLOBAL, r: DEPTH.GLOBAL, u: DEPTH.GLOBAL },
      [E.PLATFORMMAPPING]: { c: DEPTH.GLOBAL, r: DEPTH.GLOBAL, u: DEPTH.GLOBAL },
      [E.CRMLOGS]:    {                 r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Audit Compliance',
    viewPii: true,
    privileges: withReference({
      [E.CASE]:       { r: DEPTH.GLOBAL },
      [E.ACTIVITY]:   { r: DEPTH.GLOBAL },
      [E.CONSENT]:    { r: DEPTH.GLOBAL },
      [E.STRATEGY]:   { r: DEPTH.GLOBAL },
      [E.STRATEGYACTION]: { r: DEPTH.GLOBAL },
      [E.ASSIGNMENT]: { r: DEPTH.GLOBAL },
      [E.TEMPLATE]:   { r: DEPTH.GLOBAL },
      [E.PLATFORMCONFIG]:  { r: DEPTH.GLOBAL },
      [E.PLATFORMMAPPING]: { r: DEPTH.GLOBAL },
      [E.CRMLOGS]:    { r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'QDB DCP Management',
    privileges: withReference({
      [E.CASE]:       { r: DEPTH.GLOBAL },
      [E.ACTIVITY]:   { r: DEPTH.GLOBAL },
      [E.STRATEGY]:   { r: DEPTH.GLOBAL },
      [E.STRATEGYACTION]: { r: DEPTH.GLOBAL },
      [E.ASSIGNMENT]: { r: DEPTH.GLOBAL },
    }),
  },
];

/**
 * PII-masked columns for the field security profile.
 *
 * The `msst_` profile secured `msst_dcpcustomer.msst_mobile / msst_email / msst_address`. That
 * entity is retired, so customer PII now lives on `contact` / `account` — securing those columns is
 * a change to QDB-managed system entities and is NOT done unilaterally by DCP.
 * TBD — Requires QDB Confirmation: whether DCP may apply field security to contact/account columns,
 * and which existing QDB profile already covers them.
 *
 * What DCP can secure on its own entities:
 */
export const QDB_PII_COLUMNS = [
  { entity: 'qdb_collectioncase',        attribute: 'qdb_customerbusinessid' },
  { entity: 'qdb_delinquencysnapshot',   attribute: 'qdb_customerbusinessid' },
  { entity: 'qdb_identityexception',     attribute: 'qdb_customerbusinessid' },
  { entity: 'qdb_identityexception',     attribute: 'qdb_payload' },
];

/** Roles that receive the "View Sensitive PII" field-security profile. */
export const QDB_VIEW_PII_ROLES = QDB_ROLE_DEFS.filter(r => r.viewPii).map(r => r.name);
