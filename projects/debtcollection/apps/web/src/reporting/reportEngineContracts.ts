import { z } from 'zod';

/**
 * What the QDB Report Engine answers, as DCP is allowed to rely on it.
 *
 * Proven against `org5869857f` on 2026-09-26: `qdb_RunReport` returns a single-dataset shape
 * (`columns` / `rows` / `rowCount` / `truncated`) or a multi-dataset shape (`datasets[]`), and
 * `qdb_RunDashboard` returns one `data` series per widget. A refusal is HTTP 200 with `errorCode`
 * and `errorMessage` in the output — never an HTTP error — and a plugin fault arrives as OData's
 * `{ error: { code, message } }`. Everything else is malformed and is said to be.
 */

export const CellSchema = z.object({
  value: z.unknown().optional(),
  text: z.union([z.string(), z.null()]).optional(),
});

export const ColumnSchema = z.object({
  alias: z.string(),
  label: z.string().nullable().optional(),
  attribute: z.string().nullable().optional(),
  isVisible: z.boolean().optional(),
});

export const RowSchema = z.object({ cells: z.record(z.string(), CellSchema) });

export const DatasetSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  role: z.string().optional(),
  columns: z.array(ColumnSchema),
  rows: z.array(RowSchema),
  rowCount: z.number().optional(),
  truncated: z.boolean().optional(),
});

export const ReportResultSchema = z.object({
  reportId: z.string(),
  reportName: z.string().optional(),
  columns: z.array(ColumnSchema).optional(),
  rows: z.array(RowSchema).optional(),
  rowCount: z.number().optional(),
  truncated: z.boolean().optional(),
  datasets: z.array(DatasetSchema).optional(),
}).passthrough();

export const WidgetResultSchema = z.object({
  widgetId: z.string(),
  accessDenied: z.boolean().optional(),
  /** Present only when this widget failed; the dashboard itself still answers. */
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
  data: z.array(z.object({ label: z.string().nullable(), value: z.unknown() })).optional(),
}).passthrough();

export const DashboardResultSchema = z.object({
  dashboardId: z.string(),
  widgets: z.array(WidgetResultSchema),
}).passthrough();

export type ReportCell = z.infer<typeof CellSchema>;
export type ReportColumn = z.infer<typeof ColumnSchema>;
export type ReportRow = z.infer<typeof RowSchema>;
export type ReportDataset = z.infer<typeof DatasetSchema>;
export type ReportResult = z.infer<typeof ReportResultSchema>;
export type WidgetResult = z.infer<typeof WidgetResultSchema>;
export type DashboardResult = z.infer<typeof DashboardResultSchema>;

/** The Custom API output parameters, whichever of them the Engine filled in. */
export const EngineOutputSchema = z.object({
  resultJson: z.string().optional(),
  executionId: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  mode: z.string().optional(),
  jobId: z.string().optional(),
  statusPollUrl: z.string().optional(),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
}).passthrough();

export type EngineOutput = z.infer<typeof EngineOutputSchema>;

/** A report or dashboard, treated as a whole: every dataset in one list, the root first. */
export function datasetsOf(result: ReportResult): ReportDataset[] {
  if (result.datasets && result.datasets.length > 0) return result.datasets;
  return [{
    id: result.reportId, role: 'root', columns: result.columns ?? [], rows: result.rows ?? [],
    ...(result.rowCount !== undefined ? { rowCount: result.rowCount } : {}),
    ...(result.truncated !== undefined ? { truncated: result.truncated } : {}),
  }];
}
