/**
 * role-defs.mjs
 * Security role definitions for DCP Phase 1 (§C of appendix, FR-112/113).
 *
 * Access model:
 *   C = Create (depth Local/BU)
 *   R = Read   (depth Global/Org)
 *   U = Update (depth Local/BU)
 *
 * No role holds Delete on case / snapshot / audit / completed-activity.
 * That constraint is enforced both here (no Delete privilege) and by the
 * ImmutabilityGuard plugin (FR-025/047/075/110).
 *
 * "View Sensitive PII"  → field security profile assignment (field-security.mjs)
 * "Send Free-Text"      → cannot be modelled as a standalone CRM privilege via
 *                         Web API — enforced in the router as a role-claim check.
 *                         Profile column reserved for future grantability.
 */

/** Privilege depths for AddPrivilegesRole */
export const DEPTH = {
  NONE:   'None',
  BASIC:  'Basic',
  LOCAL:  'Local',
  DEEP:   'Deep',
  GLOBAL: 'Global',
};

// Entity logical names used in the privilege matrix
export const E = {
  CASE:       'msst_dcpcollectioncase',
  ACTION:     'msst_dcpcollectionaction',
  COMM:       'msst_dcpcommunication',
  PTP:        'msst_dcpptprecord',
  CONSENT:    'msst_dcpconsent',
  CONFIG:     'msst_dcpstrategyconfig',
  AUDIT:      'msst_dcpauditlog',
  CUSTOMER:   'msst_dcpcustomer',
  FACILITY:   'msst_dcploanfacility',
  SNAPSHOT:   'msst_dcpdelinquencysnapshot',
  EXCEPTION:  'msst_dcpidentityexception',
};

/**
 * Defines which CRU privileges a role holds per entity.
 * Each value is one of DEPTH.* or null (= no access).
 * Delete is always null — never granted.
 *
 * Shape: { [entity]: { c?: depth, r?: depth, u?: depth } }
 */
function priv(entityMap) { return entityMap; }

/** Organisation-owned tables accept only Global depth; the platform rejects any other. */
export const ORG_OWNED = new Set([E.CONFIG, E.SNAPSHOT, E.CONSENT, E.AUDIT]);

// Shared read-all pattern for entities every role can see
const READ_ALL = {
  [E.CUSTOMER]:  { r: DEPTH.GLOBAL },
  [E.FACILITY]:  { r: DEPTH.GLOBAL },
  [E.SNAPSHOT]:  { r: DEPTH.GLOBAL },
  [E.EXCEPTION]: { r: DEPTH.GLOBAL },
};

/** @param {object} extra overrides / additions on top of READ_ALL */
function withReadAll(extra) { return { ...READ_ALL, ...extra }; }

export const ROLE_DEFS = [
  {
    name: 'Msst DCP Collection Officer',
    privileges: withReadAll({
      [E.CASE]:    { c: DEPTH.LOCAL, r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTION]:  { c: DEPTH.LOCAL, r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.COMM]:    { c: DEPTH.LOCAL, r: DEPTH.GLOBAL },
      [E.PTP]:     { c: DEPTH.LOCAL, r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.CONSENT]: {                  r: DEPTH.GLOBAL },
      [E.CONFIG]:  {                  r: DEPTH.GLOBAL },
      [E.AUDIT]:   {                  r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Relationship Manager',
    privileges: withReadAll({
      [E.CASE]:    {                  r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTION]:  { c: DEPTH.LOCAL, r: DEPTH.GLOBAL },
      [E.COMM]:    {                  r: DEPTH.GLOBAL },
      [E.PTP]:     {                  r: DEPTH.GLOBAL },
      [E.CONSENT]: {                  r: DEPTH.GLOBAL },
      [E.CONFIG]:  {                  r: DEPTH.GLOBAL },
      [E.AUDIT]:   {                  r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Senior Manager',
    viewPii: true,
    privileges: withReadAll({
      [E.CASE]:    {                  r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTION]:  { c: DEPTH.LOCAL, r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.COMM]:    {                  r: DEPTH.GLOBAL },
      [E.PTP]:     {                  r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.CONSENT]: {                  r: DEPTH.GLOBAL },
      [E.CONFIG]:  {                  r: DEPTH.GLOBAL },
      [E.AUDIT]:   {                  r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Head of Collections',
    viewPii: true,
    privileges: withReadAll({
      [E.CASE]:    {                  r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTION]:  {                  r: DEPTH.GLOBAL },
      [E.COMM]:    {                  r: DEPTH.GLOBAL },
      [E.PTP]:     {                  r: DEPTH.GLOBAL },
      [E.CONSENT]: {                  r: DEPTH.GLOBAL },
      [E.CONFIG]:  {                  r: DEPTH.GLOBAL },
      [E.AUDIT]:   {                  r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Legal User',
    viewPii: true,
    privileges: withReadAll({
      [E.CASE]:    {                  r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTION]:  { c: DEPTH.LOCAL, r: DEPTH.GLOBAL },
      [E.COMM]:    {                  r: DEPTH.GLOBAL },
      [E.PTP]:     {                  r: DEPTH.GLOBAL },
      [E.AUDIT]:   {                  r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Insurance Officer',
    viewPii: true,
    privileges: withReadAll({
      [E.CASE]:    {                  r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTION]:  { c: DEPTH.LOCAL, r: DEPTH.GLOBAL },
      [E.COMM]:    {                  r: DEPTH.GLOBAL },
      [E.PTP]:     {                  r: DEPTH.GLOBAL },
      [E.AUDIT]:   {                  r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Restructuring Officer',
    privileges: withReadAll({
      [E.CASE]:    {                  r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.ACTION]:  { c: DEPTH.LOCAL, r: DEPTH.GLOBAL },
      [E.COMM]:    {                  r: DEPTH.GLOBAL },
      [E.PTP]:     {                  r: DEPTH.GLOBAL },
      [E.CONFIG]:  {                  r: DEPTH.GLOBAL },
      [E.AUDIT]:   {                  r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Risk Credit User',
    viewPii: true,
    privileges: withReadAll({
      [E.CASE]:    { r: DEPTH.GLOBAL },
      [E.ACTION]:  { r: DEPTH.GLOBAL },
      [E.COMM]:    { r: DEPTH.GLOBAL },
      [E.PTP]:     { r: DEPTH.GLOBAL },
      [E.CONFIG]:  { r: DEPTH.GLOBAL },
      [E.AUDIT]:   { r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Finance User',
    privileges: withReadAll({
      [E.CASE]:    { r: DEPTH.GLOBAL },
      [E.ACTION]:  { r: DEPTH.GLOBAL },
      [E.COMM]:    { r: DEPTH.GLOBAL },
      [E.PTP]:     { r: DEPTH.GLOBAL },
      [E.AUDIT]:   { r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Admin User',
    privileges: withReadAll({
      [E.CASE]:    {                  r: DEPTH.GLOBAL },
      [E.ACTION]:  {                  r: DEPTH.GLOBAL },
      [E.COMM]:    {                  r: DEPTH.GLOBAL },
      [E.PTP]:     {                  r: DEPTH.GLOBAL },
      [E.CONSENT]: { c: DEPTH.LOCAL, r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.CONFIG]:  { c: DEPTH.LOCAL, r: DEPTH.GLOBAL, u: DEPTH.LOCAL },
      [E.AUDIT]:   {                  r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Audit Compliance',
    viewPii: true,
    privileges: withReadAll({
      [E.CASE]:    { r: DEPTH.GLOBAL },
      [E.ACTION]:  { r: DEPTH.GLOBAL },
      [E.COMM]:    { r: DEPTH.GLOBAL },
      [E.PTP]:     { r: DEPTH.GLOBAL },
      [E.CONSENT]: { r: DEPTH.GLOBAL },
      [E.CONFIG]:  { r: DEPTH.GLOBAL },
      [E.AUDIT]:   { r: DEPTH.GLOBAL },
    }),
  },
  {
    name: 'Msst DCP Management',
    privileges: withReadAll({
      [E.CASE]:    { r: DEPTH.GLOBAL },
      [E.ACTION]:  { r: DEPTH.GLOBAL },
      [E.COMM]:    { r: DEPTH.GLOBAL },
      [E.PTP]:     { r: DEPTH.GLOBAL },
      [E.CONFIG]:  { r: DEPTH.GLOBAL },
      [E.AUDIT]:   { r: DEPTH.GLOBAL },
    }),
  },
];

/** PII-masked column names (for field security profile assignment) */
export const PII_COLUMNS = [
  { entity: 'msst_dcpcustomer', attribute: 'msst_mobile' },
  { entity: 'msst_dcpcustomer', attribute: 'msst_email' },
  { entity: 'msst_dcpcustomer', attribute: 'msst_address' },
];
