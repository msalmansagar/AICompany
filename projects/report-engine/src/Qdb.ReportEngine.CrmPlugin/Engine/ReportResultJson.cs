using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Serialises a <see cref="ReportResult"/> to JSON for the <c>resultJson</c> response property.
    ///
    /// Hand-written because the plugin assembly must stay self-contained (ADR-RPT-011) and net462
    /// has no <c>System.Text.Json</c>; taking a JSON dependency would force an ILRepack step for the
    /// sake of one fixed, known shape.
    /// </summary>
    internal static class ReportResultJson
    {
        public static string Write(ReportResult result)
        {
            var json = new StringBuilder(1024);
            json.Append('{');
            AppendProperty(json, "reportId", result.ReportId.ToString());
            json.Append(',');
            AppendProperty(json, "reportName", result.ReportName);

            if (result.StandaloneDatasets.Count == 0)
            {
                AppendSingleDatasetBody(json, result);
            }
            else
            {
                AppendDatasets(json, result);
            }

            json.Append('}');
            return json.ToString();
        }

        /// <summary>
        /// The shape every deployed report has always had (ADR-RPT-012 §2). A report that declares one
        /// dataset must serialise byte-for-byte as before, so the four exports, every layout, drilldown
        /// and the dashboard can migrate to the collection one at a time instead of on one flag day.
        /// </summary>
        private static void AppendSingleDatasetBody(StringBuilder json, ReportResult result)
        {
            json.Append(",\"columns\":");
            AppendColumns(json, result.Columns);
            json.Append(",\"rows\":");
            AppendRows(json, result.Rows);
            json.Append(",\"rowCount\":").Append(result.RowCount.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"truncated\":").Append(result.Truncated ? "true" : "false");
        }

        /// <summary>Root first, then each standalone block, matching execution order (MDS-FR-006).</summary>
        private static void AppendDatasets(StringBuilder json, ReportResult result)
        {
            json.Append(",\"datasets\":[");
            AppendDataset(json, RootDataset(result));
            foreach (var dataset in result.StandaloneDatasets)
            {
                json.Append(',');
                AppendDataset(json, dataset);
            }

            json.Append(']');
        }

        /// <summary>
        /// The root as a dataset in its own right, so one serialiser covers every block. Its id is the
        /// report's own: the root is the report's primary source and has no separate identity to cite.
        /// </summary>
        private static ReportDataset RootDataset(ReportResult result) => new ReportDataset
        {
            Id = result.ReportId.ToString(),
            Name = result.ReportName,
            Role = DatasetRole.Root,
            Columns = result.Columns,
            Rows = result.Rows,
            RowCount = result.RowCount,
            Truncated = result.Truncated,
            ElapsedMs = (int)result.Duration.TotalMilliseconds
        };

        private static void AppendDataset(StringBuilder json, ReportDataset dataset)
        {
            json.Append('{');
            AppendProperty(json, "id", dataset.Id);
            json.Append(',');
            AppendProperty(json, "name", dataset.Name);
            json.Append(',');
            AppendProperty(json, "role", dataset.Role);
            json.Append(",\"columns\":");
            AppendColumns(json, dataset.Columns);
            json.Append(",\"rows\":");
            AppendRows(json, dataset.Rows);
            json.Append(",\"rowCount\":").Append(dataset.RowCount.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"truncated\":").Append(dataset.Truncated ? "true" : "false");
            json.Append(",\"elapsedMs\":").Append(dataset.ElapsedMs.ToString(CultureInfo.InvariantCulture));
            json.Append(',');
            AppendProperty(json, "status", dataset.Status);
            json.Append(',');
            AppendProperty(json, "error", dataset.Error);
            json.Append('}');
        }

        private static void AppendColumns(StringBuilder json, IReadOnlyList<ReportResultColumn> columns)
        {
            json.Append('[');
            for (var index = 0; index < columns.Count; index++)
            {
                if (index > 0) json.Append(',');
                var column = columns[index];
                json.Append('{');
                AppendProperty(json, "alias", column.Alias);
                json.Append(',');
                AppendProperty(json, "label", column.Label);
                json.Append(',');
                AppendProperty(json, "attribute", column.Attribute);
                json.Append(",\"isVisible\":").Append(column.IsVisible ? "true" : "false");
                json.Append('}');
            }

            json.Append(']');
        }

        private static void AppendRows(StringBuilder json, IReadOnlyList<ReportResultRow> rows)
        {
            json.Append('[');
            for (var index = 0; index < rows.Count; index++)
            {
                if (index > 0) json.Append(',');
                // Each row is {"cells":{…}}, not the cell map on its own. The middle tier serialised
                // ReportResultRow that way and every consumer reads row.cells[alias]; flattening it
                // here produced rows whose columns all resolved to nothing.
                json.Append("{\"cells\":");
                AppendCells(json, rows[index].Cells);
                json.Append('}');
            }

            json.Append(']');
        }

        private static void AppendCells(StringBuilder json, IReadOnlyDictionary<string, ReportCell> cells)
        {
            json.Append('{');
            var first = true;
            foreach (var cell in cells)
            {
                if (!first) json.Append(',');
                first = false;

                AppendString(json, cell.Key);
                json.Append(":{\"value\":");
                AppendValue(json, cell.Value.Value);
                json.Append(',');
                AppendProperty(json, "text", cell.Value.Text);
                json.Append('}');
            }

            json.Append('}');
        }

        private static void AppendProperty(StringBuilder json, string name, string value)
        {
            AppendString(json, name);
            json.Append(':');
            if (value == null)
            {
                json.Append("null");
                return;
            }

            AppendString(json, value);
        }

        /// <summary>Emits a JSON literal for a cell value, keeping numbers and booleans untyped as text.</summary>
        private static void AppendValue(StringBuilder json, object value)
        {
            if (value == null)
            {
                json.Append("null");
                return;
            }

            if (value is bool flag)
            {
                json.Append(flag ? "true" : "false");
                return;
            }

            if (value is int || value is long || value is short || value is byte
                || value is decimal || value is double || value is float)
            {
                json.Append(Convert.ToString(value, CultureInfo.InvariantCulture));
                return;
            }

            if (value is DateTime timestamp)
            {
                AppendString(json, timestamp.ToString("o", CultureInfo.InvariantCulture));
                return;
            }

            AppendString(json, Convert.ToString(value, CultureInfo.InvariantCulture));
        }

        /// <summary>Escaping lives in one place, shared with the dashboard writer — it is a security
        /// property rather than formatting, and two copies could drift apart.</summary>
        private static void AppendString(StringBuilder json, string value) => JsonText.Append(json, value);
    }
}
