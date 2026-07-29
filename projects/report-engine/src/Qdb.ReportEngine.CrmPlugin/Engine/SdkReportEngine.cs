using System;
using System.Collections.Generic;
using System.Globalization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Runs a stored report inside the plugin sandbox (ADR-RPT-011): load the definition, build
    /// FetchXML from it, execute, and shape the rows.
    ///
    /// The definition is always loaded by id from Dataverse and never taken from the caller — the
    /// same rule that closed B3. A client-supplied definition would let a caller compose arbitrary
    /// queries over any entity and bypass the stored report's own record-level security.
    ///
    /// Every query runs on an <see cref="IOrganizationService"/> created for the initiating user, so
    /// row-level security applies without impersonation headers or tokens.
    /// </summary>
    internal sealed class SdkReportEngine
    {
        private readonly IOrganizationService _asUser;

        public SdkReportEngine(IOrganizationService asUser) => _asUser = asUser;

        public ReportDefinition LoadDefinition(Guid reportId)
        {
            var definitionRow = FirstOrNull(Retrieve(ReportDefinitionFetch.Definition(reportId)));
            if (definitionRow == null)
            {
                throw new InvalidPluginExecutionException($"Report {reportId} was not found.");
            }

            return ReportDefinitionAssembler.Assemble(new RawReportRows
            {
                Definition = definitionRow,
                DataSources = Retrieve(ReportDefinitionFetch.DataSources(reportId)),
                EntityMappings = Retrieve(ReportDefinitionFetch.EntityMappings(reportId)),
                Columns = Retrieve(ReportDefinitionFetch.Columns(reportId)),
                Filters = Retrieve(ReportDefinitionFetch.Filters(reportId)),
                Parameters = Retrieve(ReportDefinitionFetch.Parameters(reportId)),
                Formulas = Retrieve(ReportDefinitionFetch.Formulas(reportId)),
                Transformations = Retrieve(ReportDefinitionFetch.Transformations(reportId)),
                Relationships = Retrieve(ReportDefinitionFetch.Relationships(reportId))
            });
        }

        /// <summary>
        /// Builds and runs the child query behind a drilldown. Two shapes, as the retired middle tier
        /// had: a relationship carrying a SubReportId runs that separate report scoped to the parent
        /// row — with its own columns, filters and formulas — while a plain relationship synthesises a
        /// query over the related entity.
        ///
        /// It runs here rather than in the browser for the same reason the parent report does: this is
        /// the call that writes the audit record, so a drilldown cannot return data unlogged.
        /// </summary>
        public ReportResult ExecuteDrilldown(ReportDefinition parent, Guid relationshipId, string parentKey)
        {
            var relationship = FindRelationship(parent, relationshipId);

            if (relationship.SubReportId is Guid subReportId && subReportId != Guid.Empty)
            {
                var subReport = LoadDefinition(subReportId);
                var scoped = SubReportPlanner.ScopeToParent(subReport, relationship.ChildKey, parentKey);
                return Execute(scoped, new ReportExecutionRequest());
            }

            var child = DrilldownPlanner.BuildChildDefinition(parent, relationship, parentKey);
            if (!child.IsSuccess)
            {
                throw new InvalidPluginExecutionException(child.Error.Message);
            }

            return Execute(child.Value, new ReportExecutionRequest());
        }

        private static ReportRelationship FindRelationship(ReportDefinition parent, Guid relationshipId)
        {
            foreach (var relationship in parent.Relationships)
            {
                if (relationship.Id == relationshipId) return relationship;
            }

            throw new InvalidPluginExecutionException($"Relationship {relationshipId} is not part of this report.");
        }

        public ReportResult Execute(ReportDefinition definition, ReportExecutionRequest request)
        {
            var source = ReportSourcePlan.Primary(definition);
            if (ReportSourcePlan.IsStaticDataset(source))
            {
                return StaticResult(definition, source);
            }

            var query = ReportQueryBuilder.Build(definition, request);

            // A saved view or an author-written FetchXML replaces the generated query; the columns the
            // report declares still drive shaping, so the output stays the shape the designer showed.
            var fetchXml = ReportSourcePlan.OverrideFetchXml(source, name => ResolveViewFetchXml(name, query.RootEntity))
                ?? query.FetchXml;
            var rows = Retrieve(fetchXml);

            return new ReportResult
            {
                ReportId = definition.Id,
                ReportName = definition.Name,
                Columns = query.Columns,
                Rows = ReportRowShaper.Shape(query.Columns, rows),
                RowCount = rows.Count,
                // An aggregate fetch returns one row per group, so the row limit says nothing about it.
                Truncated = !query.IsAggregate && rows.Count >= query.RowLimit
            };
        }

        /// <summary>
        /// Finds a saved view by name and returns its FetchXML. System views are searched first, then
        /// personal ones. Runs as the user, so a view they cannot see is a view they cannot report on.
        ///
        /// Scoped to the report's own table. View names are not unique across the org — "My Connections"
        /// and "Active Accounts" style names repeat on many tables — so matching on the name alone could
        /// return another table's view and quietly produce a report of the wrong records.
        /// </summary>
        internal string ResolveViewFetchXml(string viewName, string entityLogicalName)
        {
            foreach (var viewEntity in new[] { "savedquery", "userquery" })
            {
                var query = new QueryExpression(viewEntity) { ColumnSet = new ColumnSet("fetchxml"), TopCount = 1 };
                query.Criteria.AddCondition("name", ConditionOperator.Equal, viewName);
                query.Criteria.AddCondition("returnedtypecode", ConditionOperator.Equal, entityLogicalName);

                var found = _asUser.RetrieveMultiple(query).Entities;
                if (found.Count > 0)
                {
                    var fetchXml = found[0].GetAttributeValue<string>("fetchxml");
                    if (!string.IsNullOrWhiteSpace(fetchXml)) return fetchXml;
                }
            }

            throw new InvalidPluginExecutionException(
                $"No saved view named '{viewName}' on {entityLogicalName} is visible to you, so this report cannot run.");
        }

        /// <summary>Builds a result from the rows written into the definition, querying nothing.</summary>
        private static ReportResult StaticResult(ReportDefinition definition, ReportDataSource source)
        {
            var dataset = ReportSourcePlan.ReadStaticRows(source.QueryPayload);
            var columns = new List<ReportResultColumn>();
            foreach (var alias in dataset.Columns)
            {
                columns.Add(new ReportResultColumn { Alias = alias, Label = alias, IsVisible = true });
            }

            var rows = new List<ReportResultRow>();
            foreach (var row in dataset.Rows)
            {
                var cells = new Dictionary<string, ReportCell>(StringComparer.Ordinal);
                foreach (var alias in dataset.Columns)
                {
                    var value = row.TryGetValue(alias, out var found) ? found : null;
                    cells[alias] = new ReportCell(value, value == null ? null : Convert.ToString(value, CultureInfo.InvariantCulture));
                }

                rows.Add(new ReportResultRow { Cells = cells });
            }

            return new ReportResult
            {
                ReportId = definition.Id,
                ReportName = definition.Name,
                Columns = columns,
                Rows = rows,
                RowCount = rows.Count,
                Truncated = false
            };
        }

        private IReadOnlyList<IReadOnlyDictionary<string, object>> Retrieve(string fetchXml) =>
            SdkRowAdapter.ToRows(_asUser.RetrieveMultiple(new FetchExpression(fetchXml)));

        private static IReadOnlyDictionary<string, object> FirstOrNull(
            IReadOnlyList<IReadOnlyDictionary<string, object>> rows) => rows.Count > 0 ? rows[0] : null;
    }
}
