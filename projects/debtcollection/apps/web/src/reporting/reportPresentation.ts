import type { ReportingScope } from '@dcp/domain';
import { formatCount, formatDate, formatMoney } from '../components/primitives.js';
import type { DashboardPanel, PanelColumn } from './dcpDashboards.js';
import type { ReportCell, ReportDataset, ReportRow } from './reportEngineContracts.js';
import type { ReportState } from './useReport.js';

/**
 * How a Report Engine answer is read for display — shared by every skin.
 *
 * V1 and V2 draw a panel differently, but they must format a cell, choose a drill-down and describe
 * a failure identically, or the same report would say two things. Everything here is pure: a cell
 * in, a string out; a row in, a scope out. No React, no styling.
 */

/** The formatted text of one cell: Money and counts from the numeric value, labels from the Engine's text. */
export function formatCell(column: PanelColumn, row: ReportRow): string {
  const cell = row.cells[column.alias];
  const value = cell?.value;
  switch (column.format) {
    case 'count': return typeof value === 'number' ? formatCount(value) : '—';
    case 'money': return typeof value === 'number' ? formatMoney(value) : '—';
    case 'decimal': return typeof value === 'number' ? new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value) : '—';
    case 'boolean': return cell?.text ?? (value === true ? 'Yes' : value === false ? 'No' : '—');
    case 'yearWeek': return typeof value === 'number' ? `${value} · week ${numberIn(row, 'week')}` : '—';
    case 'yearMonth': return monthLabel(value, numberIn(row, 'month'));
    case 'yearMonthDay': return dayLabel(value, numberIn(row, 'month'), numberIn(row, 'day'));
    default: return cell?.text ?? (value !== null && value !== undefined ? String(value) : column.emptyLabel ?? '—');
  }
}

export function isNumericColumn(column: PanelColumn): boolean {
  return column.format === 'count' || column.format === 'money' || column.format === 'decimal';
}

/** The scope a row was counted in plus the row's own dimension; `undefined` when the row has none to add. */
export function drillScopeOf(panel: DashboardPanel, row: ReportRow, scope: ReportingScope): ReportingScope | undefined {
  const column = panel.columns.find(candidate => candidate.drill !== undefined);
  if (!column?.drill) return undefined;
  const cell = row.cells[column.alias];
  const own = cell ? drillValueOf(column, cell) : undefined;
  if (own === undefined) return undefined;
  return { ...scope, [column.drill]: own };
}

/** The label the drilled dimension shows, so a list chip can name a strategy or owner without another read. */
export function drillLabelOf(panel: DashboardPanel, row: ReportRow): string | undefined {
  const column = panel.columns.find(candidate => candidate.drill !== undefined);
  if (!column) return undefined;
  const cell = row.cells[column.alias];
  return cell?.text ?? undefined;
}

function drillValueOf(column: PanelColumn, cell: ReportCell): string | undefined {
  const isEmpty = cell.value === null || cell.value === undefined;
  if (isEmpty) return column.emptyDrillValue;
  return column.drillBy === 'value' ? String(cell.value) : (cell.text ?? undefined);
}

/** A multi-dataset answer as one labelled count per dataset, in the Engine's order. */
export function countsOf(datasets: readonly ReportDataset[]): { label: string; value: string }[] {
  return datasets.map(dataset => ({ label: dataset.columns[0]?.label ?? dataset.name ?? '—', value: countOf(dataset) }));
}

function countOf(dataset: ReportDataset): string {
  const value = dataset.rows[0]?.cells[dataset.columns[0]?.alias ?? '']?.value;
  return typeof value === 'number' ? formatCount(value) : '—';
}

/** One sentence for a panel that has no answer; `undefined` when it has one. */
export function describeReportState(state: ReportState, reportCode: string): string | undefined {
  switch (state.status) {
    case 'idle':
    case 'loading': return 'Running in the Report Engine…';
    case 'missing': return `Definition ${reportCode} is not provisioned on this organisation.`;
    case 'accessDenied': return `You do not have permission to run this report. ${state.message}`;
    case 'timeout': return `Reporting service did not answer in time. ${state.message}`;
    case 'malformed': return `Reporting service answered in a shape DCP does not recognise. ${state.message}`;
    case 'refused': return `Reporting service refused the request. ${state.message}`;
    case 'unavailable': return `Reporting service unavailable. ${state.message}`;
    default: return undefined;
  }
}

export function describeDroppedDimension(dimension: string): string {
  return dimension === 'sourceSystem' ? 'CRM' : dimension;
}

function numberIn(row: ReportRow, alias: string): number | undefined {
  const value = row.cells[alias]?.value;
  return typeof value === 'number' ? value : undefined;
}

function monthLabel(year: unknown, month: number | undefined): string {
  if (typeof year !== 'number' || month === undefined) return '—';
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function dayLabel(year: unknown, month: number | undefined, day: number | undefined): string {
  if (typeof year !== 'number' || month === undefined || day === undefined) return '—';
  return formatDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
