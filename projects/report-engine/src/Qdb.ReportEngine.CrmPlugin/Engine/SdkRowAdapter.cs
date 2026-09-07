using System.Collections.Generic;
using Microsoft.Xrm.Sdk;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Projects an SDK <see cref="Entity"/> onto the attribute dictionary the shared engine reads
    /// (ADR-RPT-011). The shared assembler, row reader and shaper were written against Web API rows;
    /// adapting here rather than forking them keeps one implementation serving both runtimes.
    ///
    /// The two representations differ in ways this has to reconcile: the SDK returns typed wrappers
    /// (<see cref="EntityReference"/>, <see cref="OptionSetValue"/>, <see cref="Money"/>) where the
    /// Web API returns primitives, and it carries display text in
    /// <see cref="Entity.FormattedValues"/> rather than an annotation suffix on the key.
    /// </summary>
    internal static class SdkRowAdapter
    {
        /// <summary>The annotation suffix the shared row reader looks for display text under.</summary>
        private const string FormattedSuffix = "@OData.Community.Display.V1.FormattedValue";

        public static IReadOnlyList<IReadOnlyDictionary<string, object>> ToRows(EntityCollection records)
        {
            var rows = new List<IReadOnlyDictionary<string, object>>(records.Entities.Count);
            foreach (var record in records.Entities)
            {
                rows.Add(ToRow(record));
            }

            return rows;
        }

        public static IReadOnlyDictionary<string, object> ToRow(Entity record)
        {
            var row = new Dictionary<string, object>();

            foreach (var attribute in record.Attributes)
            {
                AddAttribute(row, attribute.Key, attribute.Value);
            }

            foreach (var formatted in record.FormattedValues)
            {
                row[formatted.Key + FormattedSuffix] = formatted.Value;
                // Lookups are read under either spelling, so annotate both.
                row["_" + formatted.Key + "_value" + FormattedSuffix] = formatted.Value;
            }

            return row;
        }

        private static void AddAttribute(IDictionary<string, object> row, string key, object value)
        {
            var unwrapped = Unwrap(value, out var displayText);
            row[key] = unwrapped;

            if (value is EntityReference || (value is AliasedValue aliased && aliased.Value is EntityReference))
            {
                // The Web API names lookups `_x_value`; the shared reader tries the plain key first
                // and falls back to that spelling. Populating both makes either path resolve.
                row["_" + key + "_value"] = unwrapped;
            }

            if (displayText != null)
            {
                row[key + FormattedSuffix] = displayText;
                row["_" + key + "_value" + FormattedSuffix] = displayText;
            }
        }

        private static object Unwrap(object value, out string displayText)
        {
            displayText = null;

            if (value is AliasedValue aliased)
            {
                return Unwrap(aliased.Value, out displayText);
            }

            if (value is EntityReference reference)
            {
                displayText = reference.Name;
                return reference.Id;
            }

            if (value is OptionSetValue option)
            {
                return option.Value;
            }

            if (value is Money money)
            {
                return money.Value;
            }

            return value;
        }
    }
}
