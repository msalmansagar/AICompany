using System;
using System.Collections.Generic;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Decides where a report's rows come from. Until now the engine always built FetchXML from the
    /// columns and filters and ignored the chosen source type entirely, so a report saved as "CRM
    /// View" or "Static Dataset" quietly behaved like any other.
    ///
    /// Three types are honoured because they resolve to something the plugin can actually reach:
    ///   CRM View       — a saved view already holds FetchXML; run that instead of building one.
    ///   FetchXML       — when the author supplied a query, run theirs rather than a generated one.
    ///   Static Dataset — inline rows, with no query at all.
    ///
    /// The rest are not, and the designer says so rather than implying support. QueryExpression and
    /// Dataverse Web API describe a different way of reaching the same Dataverse data the engine
    /// already queries, so honouring them would change nothing. SQL cannot be reached from the plugin
    /// sandbox. The four external sources — REST, Middleware, Core Banking, MIS — were scoped to V2/V3
    /// by the CEO gate decision, and on-premise they would additionally face the sandbox's outbound
    /// allowlist.
    /// </summary>
    internal static class ReportSourcePlan
    {
        public const string CrmView = "CRM View";
        public const string FetchXml = "FetchXML";
        public const string StaticDataset = "Static Dataset";

        /// <summary>The primary source, or the first one, or null when the report defines none.</summary>
        public static ReportDataSource Primary(ReportDefinition definition)
        {
            ReportDataSource first = null;
            foreach (var source in definition.DataSources)
            {
                if (source.IsPrimary) return source;
                if (first == null) first = source;
            }

            return first;
        }

        /// <summary>
        /// The FetchXML to run instead of the generated query, or null to build one as usual. A source
        /// whose payload is empty falls back to the generated query rather than failing: the type says
        /// what was intended, but an author who has not filled it in yet still gets a working report.
        /// </summary>
        public static string OverrideFetchXml(ReportDataSource source, Func<string, string> resolveViewFetchXml)
        {
            var payload = source?.QueryPayload;
            if (string.IsNullOrWhiteSpace(payload))
            {
                return null;
            }

            switch (source.SourceType?.Label)
            {
                case CrmView: return resolveViewFetchXml(payload.Trim());
                case FetchXml: return payload.Trim().StartsWith("<", StringComparison.Ordinal) ? payload.Trim() : null;
                default: return null;
            }
        }

        /// <summary>
        /// The sources that render as their own block, in execution order (MDS-FR-004, MDS-FR-006).
        ///
        /// The primary source is never one of them: it is the root, and a report whose root rendered
        /// as a detached block would have no main result at all.
        /// </summary>
        public static IReadOnlyList<ReportDataSource> Standalone(ReportDefinition definition)
        {
            var primary = Primary(definition);
            var standalone = new List<ReportDataSource>();
            foreach (var source in definition.DataSources)
            {
                // A disabled dataset is kept but not executed (MDS-FR-007).
                if (source != primary && source.IsEnabled && DatasetComposition.IsStandalone(source))
                {
                    standalone.Add(source);
                }
            }

            standalone.Sort((left, right) => left.ExecutionOrder.CompareTo(right.ExecutionOrder));
            return standalone;
        }

        public static bool IsStaticDataset(ReportDataSource source) =>
            string.Equals(source?.SourceType?.Label, StaticDataset, StringComparison.OrdinalIgnoreCase);

        /// <summary>
        /// Reads inline rows for a static dataset: a JSON array of flat objects. Column order follows
        /// the first row's keys, so what the author wrote is what the report shows.
        /// </summary>
        public static StaticDataset ReadStaticRows(string payload)
        {
            var rows = new List<IReadOnlyDictionary<string, object>>();
            var columns = new List<string>();

            foreach (var row in SimpleJson.ReadObjectArray(payload))
            {
                foreach (var key in row.Keys)
                {
                    if (!columns.Contains(key)) columns.Add(key);
                }

                rows.Add(row);
            }

            return new StaticDataset { Columns = columns, Rows = rows };
        }
    }

    internal sealed class StaticDataset
    {
        public List<string> Columns { get; set; } = new List<string>();

        public List<IReadOnlyDictionary<string, object>> Rows { get; set; } = new List<IReadOnlyDictionary<string, object>>();
    }
}
