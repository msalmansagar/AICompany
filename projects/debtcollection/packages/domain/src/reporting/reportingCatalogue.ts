import type { ReportingDimension } from './reportingScope.js';

/**
 * The DCP reporting catalogue — every report and dashboard definition DCP provisions in the QDB
 * Report Engine, and every measure they carry, with the honesty each one can claim.
 *
 * The Engine holds the *executable* definition (datasets, parameters, layout) as records; this
 * catalogue is the contract DCP consumes them by: which code, at which grain, over which source,
 * narrowed by which dimensions, opening which operational list. A measure's classification says
 * what it may be called: an authoritative MIS figure, a factual count with stated semantics, or a
 * KPI that QDB has not defined and DCP therefore does not compute.
 */

export type ReportingGrain = 'CASE' | 'CUSTOMER' | 'FACILITY' | 'ACTIVITY' | 'PTP' | 'SNAPSHOT' | 'EXCEPTION' | 'CONFIGURATION';

export type ReportingAudience = 'officer' | 'supervisor' | 'management' | 'operations';

export type MeasureClassification =
  /** MIS-derived current financial delinquency, read from the case as MIS last reported it. */
  | 'authoritative'
  /** A count, sum or distribution whose semantics are unambiguous from the record fields alone. */
  | 'factual'
  /** A KPI QDB uses but has not defined authoritatively; registered, never computed. */
  | 'definition-pending'
  /** Named in the reference material; not built, with the reason. */
  | 'deferred';

export interface MeasureEntry {
  code: string;
  title: string;
  classification: MeasureClassification;
  grain: ReportingGrain;
  /** The entity and columns the figure comes from, in words a reviewer can check. */
  source: string;
  /** Exactly what is counted or summed, including the time window where one applies. */
  semantics: string;
  /** What is pending, or why it is deferred. */
  note?: string;
}

/** The operational DCP list a definition drills into; the scope travels with the click. */
export type DrillDownTarget = 'cases' | 'queues' | 'followUps' | 'promises' | 'intake' | 'none';

export interface ReportDefinitionEntry {
  /** DCP-RPT-nnn for a report, DCP-DB-nnn for a dashboard. */
  code: string;
  title: string;
  purpose: string;
  audience: readonly ReportingAudience[];
  kind: 'report' | 'dashboard';
  grain: ReportingGrain;
  source: string;
  /** The scope dimensions the definition's parameters honour. */
  dimensions: readonly ReportingDimension[];
  measures: readonly string[];
  drillDown: DrillDownTarget;
  /** The `canexecute` grant the definition needs; provisioning records it, never grants it in production. */
  security: string;
  freshness: string;
  status: 'planned' | 'provisioned' | 'validated' | 'deferred';
}

export const MEASURES: readonly MeasureEntry[] = [
  { code: 'M-OPEN-CASES', title: 'Open cases', classification: 'factual', grain: 'CASE', source: 'qdb_collectioncase · statecode', semantics: 'Cases with statecode = 0 in scope; one case is one delinquent facility.' },
  { code: 'M-CURRENT-ARREARS', title: 'Current arrears', classification: 'authoritative', grain: 'CASE', source: 'qdb_collectioncase · qdb_currenttotalarrears', semantics: 'Sum of the MIS-reported current arrears over open cases in scope.' },
  { code: 'M-LOAN-BALANCE', title: 'Loan balance', classification: 'authoritative', grain: 'CASE', source: 'qdb_collectioncase · qdb_currentloanbalance', semantics: 'Sum of the MIS-reported current loan balance over open cases in scope. Never called exposure (KI-32).' },
  { code: 'M-DISTINCT-CUSTOMERS', title: 'Customers with an open case', classification: 'factual', grain: 'CUSTOMER', source: 'qdb_collectioncase · qdb_customerid (count distinct)', semantics: 'Distinct customer lookups over open cases in scope; shown beside the case count, never in its place (KI-18).' },
  { code: 'M-CASES-BY-BUCKET', title: 'Open cases by MIS bucket', classification: 'authoritative', grain: 'CASE', source: 'qdb_collectioncase · qdb_currentarrearbucket', semantics: 'Open cases grouped by the bucket MIS reported; the unbucketed remainder is named, never dropped.' },
  { code: 'M-CASES-BY-SOURCE', title: 'Open cases by source system', classification: 'factual', grain: 'CASE', source: 'qdb_collectioncase · qdb_organizationcode', semantics: 'Open cases grouped by the CRM of record (HL / BFD).' },
  { code: 'M-CASES-BY-STATUS', title: 'Open cases by status', classification: 'factual', grain: 'CASE', source: 'qdb_collectioncase · statuscode', semantics: 'Open cases grouped by their recorded status.' },
  { code: 'M-CASES-BY-STRATEGY', title: 'Open cases by strategy', classification: 'factual', grain: 'CASE', source: 'qdb_collectioncase · qdb_strategyid', semantics: 'Open cases grouped by resolved strategy; cases with none are "Strategy Not Assigned".' },
  { code: 'M-CASES-BY-OWNER', title: 'Open cases by owner', classification: 'factual', grain: 'CASE', source: 'qdb_collectioncase · ownerid', semantics: 'Open cases grouped by the owning user or team.' },
  { code: 'M-CONCENTRATION', title: 'Largest arrears by customer', classification: 'authoritative', grain: 'CUSTOMER', source: 'qdb_collectioncase · qdb_currenttotalarrears grouped by qdb_customerid', semantics: 'Sum of current arrears per customer over open cases in scope, largest first, bounded to a stated top N.' },
  { code: 'M-ACTIVITIES-BY-TYPE', title: 'Activities by type', classification: 'factual', grain: 'ACTIVITY', source: 'qdb_collectionactivity · qdb_activitytypeid', semantics: 'Collection activities grouped by their activity type, in the stated state and date window.' },
  { code: 'M-ACTIVITIES-BY-OWNER', title: 'Open activities by owner', classification: 'factual', grain: 'ACTIVITY', source: 'qdb_collectionactivity · ownerid, statecode', semantics: 'Open activities grouped by owner. Not a workload judgement — a count of what is open with whom.' },
  { code: 'M-ACTIVITIES-BY-AGE', title: 'Open activities by age', classification: 'factual', grain: 'ACTIVITY', source: 'qdb_collectionactivity · createdon', semantics: 'Open activities grouped by the ISO week they were recorded in. Age since recording is a fact; "overdue" is not, because no TAT start policy exists (KI-101).' },
  { code: 'M-ACTIVITIES-BY-MONTH', title: 'Activities recorded by month', classification: 'factual', grain: 'ACTIVITY', source: 'qdb_collectionactivity · createdon', semantics: 'Activities grouped by the month they were recorded in.' },
  { code: 'M-ASSIGNMENT-STATE', title: 'Open activities by assignment state', classification: 'factual', grain: 'ACTIVITY', source: 'qdb_collectionactivity · ownerid', semantics: 'Open activities with an owner versus with none. Whether an owner is the right one is not asserted.' },
  { code: 'M-ESCALATED', title: 'Escalated activities', classification: 'factual', grain: 'ACTIVITY', source: 'qdb_collectionactivity · qdb_supervisorescalated', semantics: 'Open activities whose platform escalation flag is set. No escalation policy is configured (KI-104); the flag is reported, not derived.' },
  { code: 'M-PROMISES-BY-STATUS', title: 'Promises by recorded status', classification: 'factual', grain: 'PTP', source: 'qdb_collectionactivity · qdb_ptpdate, qdb_ptpstatus, qdb_promisedamount', semantics: 'Activities carrying a PTP date grouped by their recorded status, with the promised amount summed. Each status is what an officer recorded, never a verified payment.' },
  { code: 'M-PROMISES-DUE', title: 'Promises due in a window', classification: 'factual', grain: 'PTP', source: 'qdb_collectionactivity · qdb_ptpstatus = Active, qdb_ptpdate', semantics: 'Promises with status Active whose promised date falls in the stated window [from, to). A filter, not a rate.' },
  { code: 'M-FOLLOWUPS', title: 'Follow-ups overdue and upcoming', classification: 'factual', grain: 'ACTIVITY', source: 'qdb_collectionactivity · qdb_followupdate, statecode', semantics: 'Open activities whose follow-up date is before now (overdue) or at/after now (upcoming). Scoped through the case (KI-147).' },
  { code: 'M-IDENTITY-EXCEPTIONS', title: 'Identity exceptions', classification: 'factual', grain: 'EXCEPTION', source: 'qdb_identityexception · qdb_exceptionstatus, qdb_exceptionreason', semantics: 'Identity exceptions grouped by status and reason.' },
  { code: 'M-CASES-UNBUCKETED', title: 'Open cases with no MIS bucket', classification: 'factual', grain: 'CASE', source: 'qdb_collectioncase · qdb_currentarrearbucket is null', semantics: 'Open cases MIS has not placed in a bucket.' },
  { code: 'M-CASES-NO-CUSTOMER', title: 'Open cases with no customer', classification: 'factual', grain: 'CASE', source: 'qdb_collectioncase · qdb_customerid is null', semantics: 'Open cases whose customer lookup is empty.' },
  { code: 'M-CONFIG-GAPS', title: 'Configuration gaps', classification: 'factual', grain: 'CONFIGURATION', source: 'qdb_assignmentconfiguration, qdb_escalationconfiguration, qdb_collectionactivitytype ↔ qdb_activityoutcome, qdb_strategyaction · qdb_activitytypeid', semantics: 'Counts of configuration rows that are absent or incomplete: assignment rows, escalation rows, activity types with no outcome (KI-131), strategy actions with no activity type (KI-106).' },
  { code: 'M-INTEGRATION-EXCEPTIONS', title: 'Integration exceptions', classification: 'factual', grain: 'CONFIGURATION', source: 'qdb_crmlog · qdb_isexception, createdon', semantics: 'Technical log entries flagged as exceptions in the stated window. A technical count under "Integration", never a business KPI.' },
  { code: 'M-SNAPSHOT-OBSERVATIONS', title: 'Delinquency observations', classification: 'authoritative', grain: 'SNAPSHOT', source: 'qdb_delinquencysnapshot · qdb_snapshotdate, qdb_totalarrears, qdb_loanbalance, qdb_dpd, qdb_facilitysourcesystem', semantics: 'Stored MIS observations grouped by observation date and source system: facilities observed, arrears and balance summed, DPD averaged. One observation is one point; nothing is interpolated between points.' },
  { code: 'K-CURE-RATE', title: 'Cure rate', classification: 'definition-pending', grain: 'CASE', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation: numerator, denominator, window and episode treatment undefined; the book has 0 cured cases.' },
  { code: 'K-ROLL-RATE', title: 'Roll rate', classification: 'definition-pending', grain: 'FACILITY', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation; also blocked by KI-53 (no MIS transition feed) and a single ARR observation.' },
  { code: 'K-RECOVERY-RATE', title: 'Recovery rate', classification: 'definition-pending', grain: 'CASE', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation; no verified payment data.' },
  { code: 'K-COLLECTION-EFFECTIVENESS', title: 'Collection effectiveness', classification: 'definition-pending', grain: 'CASE', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation.' },
  { code: 'K-PTP-KEPT-RATE', title: 'PTP kept rate', classification: 'definition-pending', grain: 'PTP', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation; statuses are officer-recorded and unverified.' },
  { code: 'K-PTP-BROKEN-RATE', title: 'Broken PTP rate', classification: 'definition-pending', grain: 'PTP', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation.' },
  { code: 'K-CONTACT-RATE', title: 'Contact rate', classification: 'definition-pending', grain: 'ACTIVITY', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation; no attempt/contact outcome taxonomy is authoritative.' },
  { code: 'K-RIGHT-PARTY-CONTACT', title: 'Right-party contact', classification: 'definition-pending', grain: 'ACTIVITY', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation.' },
  { code: 'K-LIQUIDATION-RATE', title: 'Liquidation rate', classification: 'definition-pending', grain: 'FACILITY', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation.' },
  { code: 'K-COLLECTOR-PRODUCTIVITY', title: 'Collector productivity', classification: 'definition-pending', grain: 'ACTIVITY', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation.' },
  { code: 'K-SLA-COMPLIANCE', title: 'SLA compliance', classification: 'definition-pending', grain: 'ACTIVITY', source: '—', semantics: 'Not computed.', note: 'Definition Pending QDB Confirmation; no TAT start policy (KI-101).' },
  { code: 'D-PORTFOLIO-MIS', title: 'Portfolio MIS transitions', classification: 'deferred', grain: 'FACILITY', source: '—', semantics: 'Not built.', note: 'Blocked by KI-53: no MIS transport contract for bucket transitions or month-over-month movement.' },
];

export const REPORT_DEFINITIONS: readonly ReportDefinitionEntry[] = [
  { code: 'DCP-RPT-001', title: 'Open cases by MIS bucket', purpose: 'Delinquency distribution with arrears and balance, per bucket', audience: ['supervisor', 'management'], kind: 'report', grain: 'CASE', source: 'qdb_collectioncase (MIS-derived current position)', dimensions: ['sourceSystem', 'strategy', 'caseStatus', 'owner'], measures: ['M-OPEN-CASES', 'M-CURRENT-ARREARS', 'M-LOAN-BALANCE', 'M-CASES-BY-BUCKET', 'M-CASES-UNBUCKETED'], drillDown: 'cases', security: 'canexecute for DCP officer, supervisor and manager roles', freshness: 'Stored MIS position as of the case\'s qdb_misasofdate; not a live MIS read', status: 'validated' },
  { code: 'DCP-RPT-002', title: 'Open cases by source system', purpose: 'Portfolio split between Housing Loan and BFD', audience: ['management'], kind: 'report', grain: 'CASE', source: 'qdb_collectioncase', dimensions: ['bucket', 'strategy', 'caseStatus'], measures: ['M-CASES-BY-SOURCE', 'M-CURRENT-ARREARS', 'M-LOAN-BALANCE'], drillDown: 'cases', security: 'canexecute for DCP roles', freshness: 'Stored MIS position', status: 'validated' },
  { code: 'DCP-RPT-003', title: 'Open cases by status', purpose: 'Lifecycle distribution', audience: ['supervisor', 'management'], kind: 'report', grain: 'CASE', source: 'qdb_collectioncase · statuscode', dimensions: ['sourceSystem', 'bucket', 'strategy', 'owner'], measures: ['M-CASES-BY-STATUS'], drillDown: 'cases', security: 'canexecute for DCP roles', freshness: 'CRM query time', status: 'validated' },
  { code: 'DCP-RPT-004', title: 'Open cases by strategy', purpose: 'Which strategy governs the book, and how much has none', audience: ['supervisor', 'management'], kind: 'report', grain: 'CASE', source: 'qdb_collectioncase · qdb_strategyid', dimensions: ['sourceSystem', 'bucket', 'caseStatus'], measures: ['M-CASES-BY-STRATEGY', 'M-CURRENT-ARREARS'], drillDown: 'cases', security: 'canexecute for DCP roles', freshness: 'CRM query time', status: 'validated' },
  { code: 'DCP-RPT-005', title: 'Open cases by owner', purpose: 'Who holds the open book', audience: ['supervisor'], kind: 'report', grain: 'CASE', source: 'qdb_collectioncase · ownerid', dimensions: ['sourceSystem', 'bucket', 'strategy', 'caseStatus'], measures: ['M-CASES-BY-OWNER', 'M-CURRENT-ARREARS'], drillDown: 'cases', security: 'canexecute for DCP supervisor and manager roles', freshness: 'CRM query time', status: 'validated' },
  { code: 'DCP-RPT-006', title: 'Largest arrears by customer', purpose: 'Concentration of current arrears', audience: ['management'], kind: 'report', grain: 'CUSTOMER', source: 'qdb_collectioncase grouped by qdb_customerid', dimensions: ['sourceSystem', 'bucket'], measures: ['M-CONCENTRATION', 'M-DISTINCT-CUSTOMERS'], drillDown: 'cases', security: 'canexecute for DCP manager role', freshness: 'Stored MIS position', status: 'validated' },
  { code: 'DCP-RPT-007', title: 'Open activities by owner', purpose: 'Work held per owner, and how much is unassigned', audience: ['supervisor'], kind: 'report', grain: 'ACTIVITY', source: 'qdb_collectionactivity · ownerid, statecode', dimensions: ['activityType'], measures: ['M-ACTIVITIES-BY-OWNER', 'M-ASSIGNMENT-STATE'], drillDown: 'queues', security: 'canexecute for DCP supervisor role', freshness: 'CRM query time', status: 'validated' },
  { code: 'DCP-RPT-008', title: 'Activities by type', purpose: 'What kind of work is recorded, in a window', audience: ['supervisor', 'management'], kind: 'report', grain: 'ACTIVITY', source: 'qdb_collectionactivity · qdb_activitytypeid, createdon', dimensions: ['owner', 'activityState', 'dateFrom', 'dateTo'], measures: ['M-ACTIVITIES-BY-TYPE'], drillDown: 'queues', security: 'canexecute for DCP roles', freshness: 'CRM query time', status: 'validated' },
  { code: 'DCP-RPT-009', title: 'Open activities by week recorded', purpose: 'How long open work has been open, by the week it was recorded, and whether it carries the escalation flag', audience: ['supervisor'], kind: 'report', grain: 'ACTIVITY', source: 'qdb_collectionactivity · createdon, statecode', dimensions: ['owner', 'activityType'], measures: ['M-ACTIVITIES-BY-AGE', 'M-ESCALATED'], drillDown: 'queues', security: 'canexecute for DCP supervisor role', freshness: 'CRM query time', status: 'validated' },
  { code: 'DCP-RPT-010', title: 'Activities by month', purpose: 'Recorded activity volume over time', audience: ['management'], kind: 'report', grain: 'ACTIVITY', source: 'qdb_collectionactivity · createdon', dimensions: ['activityType', 'dateFrom', 'dateTo'], measures: ['M-ACTIVITIES-BY-MONTH'], drillDown: 'none', security: 'canexecute for DCP roles', freshness: 'CRM query time', status: 'validated' },
  { code: 'DCP-RPT-011', title: 'Promises by status', purpose: 'The promise book as officers recorded it', audience: ['supervisor', 'management'], kind: 'report', grain: 'PTP', source: 'qdb_collectionactivity with a PTP date', dimensions: ['owner', 'dateFrom', 'dateTo'], measures: ['M-PROMISES-BY-STATUS'], drillDown: 'promises', security: 'canexecute for DCP roles', freshness: 'CRM query time; statuses are officer-recorded, not verified payments', status: 'validated' },
  { code: 'DCP-RPT-012', title: 'Identity exceptions', purpose: 'Intake identity problems by status and reason', audience: ['operations'], kind: 'report', grain: 'EXCEPTION', source: 'qdb_identityexception', dimensions: ['dateFrom', 'dateTo'], measures: ['M-IDENTITY-EXCEPTIONS'], drillDown: 'intake', security: 'canexecute for DCP operations and manager roles', freshness: 'CRM query time', status: 'validated' },
  { code: 'DCP-RPT-013', title: 'Delinquency observations', purpose: 'Stored MIS observations over time, per source system', audience: ['management'], kind: 'report', grain: 'SNAPSHOT', source: 'qdb_delinquencysnapshot', dimensions: ['sourceSystem', 'dateFrom', 'dateTo'], measures: ['M-SNAPSHOT-OBSERVATIONS'], drillDown: 'intake', security: 'canexecute for DCP manager role', freshness: 'Each point is one stored observation (qdb_snapshotdate); the ARR book has one', status: 'validated' },
  { code: 'DCP-RPT-014', title: 'Configuration gaps', purpose: 'What the platform cannot do because configuration is absent', audience: ['operations'], kind: 'report', grain: 'CONFIGURATION', source: 'configuration entities', dimensions: [], measures: ['M-CONFIG-GAPS', 'M-CASES-NO-CUSTOMER', 'M-CASES-UNBUCKETED', 'M-INTEGRATION-EXCEPTIONS'], drillDown: 'none', security: 'canexecute for DCP operations and manager roles', freshness: 'CRM query time', status: 'validated' },
  { code: 'DCP-RPT-015', title: 'Portfolio totals', purpose: 'Open cases, distinct customers, current arrears and loan balance as one row', audience: ['management'], kind: 'report', grain: 'CASE', source: 'qdb_collectioncase (MIS-derived current position; distinct customers counted beside cases, never in their place)', dimensions: ['sourceSystem', 'bucket', 'strategy', 'caseStatus', 'owner'], measures: ['M-OPEN-CASES', 'M-DISTINCT-CUSTOMERS', 'M-CURRENT-ARREARS', 'M-LOAN-BALANCE'], drillDown: 'cases', security: 'canexecute for DCP manager role', freshness: 'Stored MIS position', status: 'validated' },
  { code: 'DCP-DB-001', title: 'Portfolio Overview', purpose: 'Management view of the open book', audience: ['management'], kind: 'dashboard', grain: 'CASE', source: 'DCP-RPT-015, 001, 002, 003, 004, 006', dimensions: ['sourceSystem'], measures: ['M-OPEN-CASES', 'M-CURRENT-ARREARS', 'M-LOAN-BALANCE', 'M-DISTINCT-CUSTOMERS'], drillDown: 'cases', security: 'canexecute for DCP manager role', freshness: 'Stored MIS position', status: 'planned' },
  { code: 'DCP-DB-002', title: 'Supervisor Overview', purpose: 'Open work, who holds it, how old it is', audience: ['supervisor'], kind: 'dashboard', grain: 'ACTIVITY', source: 'DCP-RPT-005, 007, 008, 009, 011', dimensions: ['sourceSystem'], measures: ['M-ACTIVITIES-BY-OWNER', 'M-ASSIGNMENT-STATE', 'M-ESCALATED', 'M-PROMISES-BY-STATUS'], drillDown: 'queues', security: 'canexecute for DCP supervisor role', freshness: 'CRM query time', status: 'planned' },
  { code: 'DCP-DB-003', title: 'Exception Overview', purpose: 'Intake, identity and configuration problems', audience: ['operations'], kind: 'dashboard', grain: 'EXCEPTION', source: 'DCP-RPT-012, 014', dimensions: [], measures: ['M-IDENTITY-EXCEPTIONS', 'M-CONFIG-GAPS', 'M-INTEGRATION-EXCEPTIONS'], drillDown: 'intake', security: 'canexecute for DCP operations role', freshness: 'CRM query time', status: 'planned' },
  { code: 'DCP-DB-004', title: 'Historical Delinquency', purpose: 'Stored observations over time', audience: ['management'], kind: 'dashboard', grain: 'SNAPSHOT', source: 'DCP-RPT-013', dimensions: ['sourceSystem'], measures: ['M-SNAPSHOT-OBSERVATIONS'], drillDown: 'intake', security: 'canexecute for DCP manager role', freshness: 'One point per stored observation', status: 'planned' },
];

export function measureByCode(code: string): MeasureEntry | undefined {
  return MEASURES.find(measure => measure.code === code);
}

export function definitionByCode(code: string): ReportDefinitionEntry | undefined {
  return REPORT_DEFINITIONS.find(definition => definition.code === code);
}

/** The measures a definition may show; a definition naming a pending KPI is a catalogue error. */
export function computableMeasuresOf(definition: ReportDefinitionEntry): MeasureEntry[] {
  return definition.measures
    .map(measureByCode)
    .filter((measure): measure is MeasureEntry => measure !== undefined)
    .filter(measure => measure.classification === 'authoritative' || measure.classification === 'factual');
}
