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
            json.Append(",\"columns\":");
            AppendColumns(json, result.Columns);
            json.Append(",\"rows\":");
            AppendRows(json, result.Rows);
            json.Append(",\"rowCount\":").Append(result.RowCount.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"truncated\":").Append(result.Truncated ? "true" : "false");
            json.Append('}');
            return json.ToString();
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

        /// <summary>
        /// Escapes per RFC 8259. Control characters and the HTML-significant &lt; &gt; &amp; are
        /// emitted as \u escapes so the payload cannot break out of a script context in the browser
        /// that consumes it.
        /// </summary>
        private static void AppendString(StringBuilder json, string value)
        {
            json.Append('"');
            foreach (var character in value)
            {
                switch (character)
                {
                    case '"': json.Append("\\\""); break;
                    case '\\': json.Append("\\\\"); break;
                    case '\b': json.Append("\\b"); break;
                    case '\f': json.Append("\\f"); break;
                    case '\n': json.Append("\\n"); break;
                    case '\r': json.Append("\\r"); break;
                    case '\t': json.Append("\\t"); break;
                    default:
                        if (character < ' ' || character == '<' || character == '>' || character == '&')
                        {
                            json.Append("\\u").Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            json.Append(character);
                        }

                        break;
                }
            }

            json.Append('"');
        }
    }
}
