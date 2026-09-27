import type { ReportingScope } from '@dcp/domain';

/**
 * DCP's dashboards as compositions of Report Engine reports.
 *
 * The Engine's own dashboard runs with no parameters and no filters (KI-151), so a dashboard that
 * honours the scope is a set of *reports*, each run with that scope. A panel names the definition it
 * shows (by catalogue code — the id is resolved on the organisation), how to present the answer,
 * which cells are shown with which format, and which cell narrows the scope for a drill-down. Nothing
 * here computes: every number comes back from the Engine as the signed-in user.
 */

export type CellFormat = 'text' | 'count' | 'money' | 'decimal' | 'boolean' | 'yearWeek' | 'yearMonth' | 'yearMonthDay';

/** How a cell's own value narrows the scope: option cells drill by their label, lookups by their id. */
export type DrillBy = 'text' | 'value';

export interface PanelColumn {
  alias: string;
  label: string;
  format: CellFormat;
  /** The scope dimension this cell's value becomes when a row is opened. */
  drill?: keyof ReportingScope;
  drillBy?: DrillBy;
  /** What an empty cell means in this column, when it is a population of its own. */
  emptyLabel?: string;
  /** The scope value an empty cell drills to; `undefined` means an empty cell is not a drill-down. */
  emptyDrillValue?: string;
}

export type PanelKind = 'kpis' | 'table' | 'counts';

export interface DashboardPanel {
  report: string;
  title: string;
  kind: PanelKind;
  columns: readonly PanelColumn[];
  /** Said under the panel; what the figures are and are not. */
  note?: string;
}

export interface DcpDashboard {
  code: string;
  title: string;
  audience: string;
  panels: readonly DashboardPanel[];
}

const BUCKET: PanelColumn = { alias: 'bucket', label: 'MIS bucket', format: 'text', drill: 'bucket', drillBy: 'text', emptyLabel: 'Unbucketed' };
const CASES: PanelColumn = { alias: 'cases', label: 'Open cases', format: 'count' };
const ARREARS: PanelColumn = { alias: 'arrears', label: 'Current arrears', format: 'money' };
const BALANCE: PanelColumn = { alias: 'balance', label: 'Loan balance', format: 'money' };

export const DCP_DASHBOARDS: readonly DcpDashboard[] = [
  {
    code: 'DCP-DB-001', title: 'Portfolio Overview', audience: 'Management',
    panels: [
      { report: 'DCP-RPT-015', title: 'Open book', kind: 'kpis', columns: [CASES, { alias: 'customers', label: 'Customers with an open case', format: 'count' }, ARREARS, BALANCE], note: 'Customers are counted beside cases, never in their place: one customer may hold several delinquent facilities.' },
      { report: 'DCP-RPT-001', title: 'Open cases by MIS bucket', kind: 'table', columns: [BUCKET, CASES, ARREARS, BALANCE], note: 'The bucket is the one MIS reported. An unbucketed case is named, not dropped.' },
      { report: 'DCP-RPT-002', title: 'Open cases by source system', kind: 'table', columns: [{ alias: 'source', label: 'CRM of record', format: 'text', drill: 'sourceSystem', drillBy: 'text' }, CASES, ARREARS, BALANCE] },
      { report: 'DCP-RPT-003', title: 'Open cases by status', kind: 'table', columns: [{ alias: 'status', label: 'Status', format: 'text', drill: 'caseStatus', drillBy: 'text' }, CASES, ARREARS] },
      { report: 'DCP-RPT-004', title: 'Open cases by strategy', kind: 'table', columns: [{ alias: 'strategy', label: 'Strategy', format: 'text', drill: 'strategy', drillBy: 'value', emptyLabel: 'Strategy Not Assigned', emptyDrillValue: 'none' }, CASES, ARREARS] },
      { report: 'DCP-RPT-006', title: 'Largest arrears by customer', kind: 'table', columns: [{ alias: 'customer', label: 'Customer', format: 'text' }, ARREARS, CASES], note: 'The 25 customers with the largest current arrears over their open cases. Concentration, not a risk grade.' },
    ],
  },
  {
    code: 'DCP-DB-002', title: 'Supervisor Overview', audience: 'Supervisors',
    panels: [
      { report: 'DCP-RPT-005', title: 'Open cases by owner', kind: 'table', columns: [{ alias: 'owner', label: 'Owner', format: 'text', drill: 'owner', drillBy: 'value' }, CASES, ARREARS], note: 'Who holds the open book. Every case owned by the integration account has had no human assignment.' },
      { report: 'DCP-RPT-007', title: 'Open activities by owner', kind: 'table', columns: [{ alias: 'owner', label: 'Owner', format: 'text' }, { alias: 'activities', label: 'Open activities', format: 'count' }], note: 'A count of what is open with whom — not a workload judgement.' },
      { report: 'DCP-RPT-008', title: 'Activities by type', kind: 'table', columns: [{ alias: 'type', label: 'Activity type', format: 'text' }, { alias: 'activities', label: 'Activities', format: 'count' }] },
      { report: 'DCP-RPT-009', title: 'Open activities by week recorded', kind: 'table', columns: [{ alias: 'year', label: 'Week recorded', format: 'yearWeek' }, { alias: 'escalated', label: 'Escalated', format: 'boolean' }, { alias: 'activities', label: 'Open activities', format: 'count' }], note: 'Age since recording is a fact; "overdue" is not, because no TAT start policy exists. The escalation flag is reported, not derived.' },
      { report: 'DCP-RPT-011', title: 'Promises by recorded status', kind: 'table', columns: [{ alias: 'status', label: 'Recorded status', format: 'text' }, { alias: 'promises', label: 'Promises', format: 'count' }, { alias: 'promised', label: 'Promised amount', format: 'money' }], note: 'Each status is what an officer recorded, never a verified payment. Kept and broken rates are Definition Pending QDB Confirmation.' },
      { report: 'DCP-RPT-010', title: 'Activities by month recorded', kind: 'table', columns: [{ alias: 'year', label: 'Month', format: 'yearMonth' }, { alias: 'activities', label: 'Activities', format: 'count' }] },
    ],
  },
  {
    code: 'DCP-DB-003', title: 'Exception Overview', audience: 'Operations',
    panels: [
      { report: 'DCP-RPT-012', title: 'Identity exceptions by status and reason', kind: 'table', columns: [{ alias: 'status', label: 'Status', format: 'text' }, { alias: 'reason', label: 'Reason', format: 'text' }, { alias: 'exceptions', label: 'Exceptions', format: 'count' }] },
      { report: 'DCP-RPT-014', title: 'Configuration gaps', kind: 'counts', columns: [{ alias: 'rows', label: 'Rows', format: 'count' }], note: 'What the platform cannot do because configuration is absent. Zero configuration rows is the finding, not an error. Integration exceptions are a technical count, never a business KPI.' },
    ],
  },
  {
    code: 'DCP-DB-004', title: 'Historical Delinquency', audience: 'Management',
    panels: [
      { report: 'DCP-RPT-013', title: 'Delinquency observations by date and source system', kind: 'table', columns: [{ alias: 'year', label: 'Observed', format: 'yearMonthDay' }, { alias: 'source', label: 'CRM of record', format: 'text' }, { alias: 'facilities', label: 'Facilities observed', format: 'count' }, { alias: 'arrears', label: 'Total arrears', format: 'money' }, BALANCE, { alias: 'dpd', label: 'Average DPD', format: 'decimal' }], note: 'Nothing is interpolated between points; the weekly series is DEMO data. Dates are grouped in your own time zone.' },
    ],
  },
];

export function dashboardByCode(code: string): DcpDashboard | undefined {
  return DCP_DASHBOARDS.find(dashboard => dashboard.code === code);
}
