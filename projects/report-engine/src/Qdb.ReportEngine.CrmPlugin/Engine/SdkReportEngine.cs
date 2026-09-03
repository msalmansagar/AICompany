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
            /* The root's own query time (MDS-FR-027). Without it the root block reported 0 ms beside
               standalone blocks reporting real figures, which reads as an instant query rather than
               as a number nobody set. The browser's elapsedMs is the round trip, which is a different
               measurement and belongs to the request, not to the dataset. */
            var started = DateTime.UtcNow;
            var source = ReportSourcePlan.Primary(definition);
            if (ReportSourcePlan.IsStaticDataset(source))
            {
                // A static root still carries its report's other blocks; returning early here would
                // drop every one of them silently.
                var staticResult = StaticResult(definition, source);
                return staticResult with
                {
                    Duration = DateTime.UtcNow - started,
                    StandaloneDatasets = ExecuteStandaloneDatasets(definition, request, staticResult.Rows)
                };
            }

            var query = ReportQueryBuilder.Build(definition, request);

            // A saved view or an author-written FetchXML replaces the generated query; the columns the
            // report declares still drive shaping, so the output stays the shape the designer showed.
            // The report's own filters are carried across rather than discarded with the query that
            // held them — otherwise the Filters tab and every runtime prompt would change nothing.
            var supplied = ReportSourcePlan.OverrideFetchXml(source, name => ResolveViewFetchXml(name, query.RootEntity));
            // @Parameter tokens in an authored query resolve exactly as a runtime-prompt filter
            // would: supplied value first, then the parameter's default. Blocks pass through here
            // too (a block re-enters Execute as its own primary), so one line serves every dataset.
            if (supplied is not null)
            {
                supplied = ParameterSubstitution.ApplyTo(supplied, definition, request.ParameterValues);
            }

            var fetchXml = supplied is null ? query.FetchXml : Combine(supplied, query);
            var rows = Retrieve(fetchXml);

            var shaped = ReportRowShaper.Shape(query.Columns, rows);

            return new ReportResult
            {
                ReportId = definition.Id,
                ReportName = definition.Name,
                Columns = query.Columns,
                Rows = shaped,
                RowCount = rows.Count,
                // An aggregate fetch returns one row per group, so the row limit says nothing about it.
                Truncated = !query.IsAggregate && rows.Count >= query.RowLimit,
                Duration = DateTime.UtcNow - started,
                StandaloneDatasets = ExecuteStandaloneDatasets(definition, request, shaped)
            };
        }

        /// <summary>
        /// Runs each standalone dataset after the root, in execution order (MDS-FR-004, MDS-FR-006).
        ///
        /// Sequential rather than concurrent, per ADR-RPT-012 §4: in-CRM execution is already
        /// per-user, which is what the retired fan-out controls existed to achieve, and adding
        /// parallelism inside one execution would reintroduce that problem inside a two-minute
        /// ceiling.
        /// </summary>
        private IReadOnlyList<ReportDataset> ExecuteStandaloneDatasets(
            ReportDefinition definition, ReportExecutionRequest request, IReadOnlyList<ReportResultRow> rootRows)
        {
            var datasets = new List<ReportDataset>();
            foreach (var source in ReportSourcePlan.Standalone(definition))
            {
                datasets.Add(ExecuteStandaloneDataset(definition, source, new DatasetContext(request, rootRows)));
            }

            return datasets;
        }

        /// <summary>What a standalone dataset needs beyond its own definition: the run's inputs, and the
        /// root's rows, which is where a parent-scoped block reads its parent key from.</summary>
        private sealed class DatasetContext
        {
            public DatasetContext(ReportExecutionRequest request, IReadOnlyList<ReportResultRow> rootRows)
            {
                Request = request;
                RootRows = rootRows;
            }

            public ReportExecutionRequest Request { get; }

            public IReadOnlyList<ReportResultRow> RootRows { get; }
        }

        /// <summary>
        /// Runs one standalone dataset, reporting a failure as a named block rather than letting it
        /// end the report (MDS-FR-016, MDS-FR-028).
        ///
        /// The catch is deliberately broad and is not swallowing: the reason is carried into the
        /// result and rendered. One misconfigured block must not cost the author every other dataset
        /// on the report, and an empty table in its place would be indistinguishable from a query
        /// that legitimately matched nothing.
        /// </summary>
        private ReportDataset ExecuteStandaloneDataset(
            ReportDefinition definition, ReportDataSource source, DatasetContext context)
        {
            var started = DateTime.UtcNow;
            try
            {
                var result = Execute(ScopedToParentRow(definition, source, context.RootRows), context.Request);
                return new ReportDataset
                {
                    Id = source.Id.ToString(),
                    Name = DatasetName(source),
                    Role = DatasetRole.Standalone,
                    Columns = result.Columns,
                    Rows = result.Rows,
                    RowCount = result.RowCount,
                    Truncated = result.Truncated,
                    ElapsedMs = Elapsed(started)
                };
            }
            catch (Exception error)
            {
                return new ReportDataset
                {
                    Id = source.Id.ToString(),
                    Name = DatasetName(source),
                    Role = DatasetRole.Standalone,
                    ElapsedMs = Elapsed(started),
                    Status = DatasetStatus.Failed,
                    Error = error.Message
                };
            }
        }

        /// <summary>
        /// The report as this one source sees it: the source becomes the only source, and its own
        /// entity becomes the root.
        ///
        /// The composition is flipped to joined so the query builder includes the source's mappings —
        /// it excludes standalone ones precisely so they do not leak into the parent's query.
        ///
        /// The report's filters are dropped rather than carried across: they name attributes of the
        /// root entity, and a standalone block queries a different one, so applying them would fail
        /// the query outright. Relationships go with them — drilldown belongs to the root
        /// (MDS-FR-025).
        /// </summary>
        /// <summary>
        /// A standalone block scoped to the parent the report is about (MDS-FR-003).
        ///
        /// This is the master-detail case: one Termsheet with its Requested Facilities and its
        /// Termsheet Conditions. Each block queries its own table and must be filtered to the parent,
        /// or it returns every row in that table — which looks like data and is the wrong data.
        ///
        /// A block that declares no join key is independent and runs unscoped; that is a legitimate
        /// configuration rather than an omission.
        ///
        /// The parent value comes from the root's FIRST row. This design assumes the root resolves to
        /// one record, which is what a term-sheet document is. A root returning several rows still
        /// scopes to the first — repeating the blocks per parent is a different report shape and is
        /// not built.
        /// </summary>
        private static ReportDefinition ScopedToParentRow(
            ReportDefinition definition, ReportDataSource source, IReadOnlyList<ReportResultRow> rootRows)
        {
            var scoped = ScopedToSource(definition, source);
            if (string.IsNullOrEmpty(source.JoinFromKey)) return scoped;

            if (string.IsNullOrEmpty(source.JoinToKey))
            {
                throw new InvalidPluginExecutionException(
                    $"This dataset is scoped by \"{source.JoinFromKey}\" but does not say which column on the "
                    + "main report identifies the parent.");
            }

            // No parent row means no children. Returning the whole table here would be the defect this
            // scoping exists to prevent.
            if (rootRows.Count == 0) return ScopeToNothing(scoped, source.JoinFromKey);

            var parentKey = ParentKeyOf(rootRows[0], source.JoinToKey);
            if (string.IsNullOrEmpty(parentKey))
            {
                throw new InvalidPluginExecutionException(
                    $"The main report does not return \"{source.JoinToKey}\", so this dataset cannot be scoped "
                    + "to it. Add that column to the report, or clear the dataset's join keys to run it unscoped.");
            }

            return SubReportPlanner.ScopeToParent(scoped, source.JoinFromKey, parentKey);
        }

        /// <summary>Reads the parent's identifying value, preferring the stored value over its display text.</summary>
        private static string ParentKeyOf(ReportResultRow row, string alias)
        {
            if (!row.Cells.TryGetValue(alias, out var cell)) return null;
            if (cell.Value != null) return Convert.ToString(cell.Value, CultureInfo.InvariantCulture);
            return cell.Text;
        }

        /// <summary>
        /// A filter that matches nothing, for a block whose parent did not come back. An empty block is
        /// the truth here; the whole table would not be.
        /// </summary>
        private static ReportDefinition ScopeToNothing(ReportDefinition scoped, string childKey) =>
            SubReportPlanner.ScopeToParent(scoped, childKey, Guid.Empty.ToString());

        private static ReportDefinition ScopedToSource(ReportDefinition definition, ReportDataSource source) =>
            definition with
            {
                MainEntityLogicalName = FirstMappedEntity(source) ?? definition.MainEntityLogicalName,
                DataSources = new[] { source with { Composition = DatasetComposition.Joined } },
                // The report's own filters name root-entity attributes and would fail this query;
                // the block KEEPS the filters bound to it, which name its own table's (D2).
                Filters = definition.Filters.Where(f => f.DataSourceId == source.Id).ToList(),
                Relationships = new List<ReportRelationship>(),
                // The block's own cap where it has one (MDS-FR-008); the report's otherwise. A child
                // list usually wants a different bound from the report it hangs off.
                RowLimit = source.RowLimit ?? definition.RowLimit
            };

        private static string FirstMappedEntity(ReportDataSource source)
        {
            foreach (var mapping in source.EntityMappings)
            {
                if (!string.IsNullOrEmpty(mapping.EntityLogicalName)) return mapping.EntityLogicalName;
            }

            return null;
        }

        /// <summary>A block is headed by its source's name, falling back to its alias then its id.</summary>
        private static string DatasetName(ReportDataSource source) =>
            !string.IsNullOrEmpty(source.Name) ? source.Name
            : !string.IsNullOrEmpty(source.SourceAlias) ? source.SourceAlias
            : source.Id.ToString();

        private static int Elapsed(DateTime started) =>
            (int)(DateTime.UtcNow - started).TotalMilliseconds;

        /// <summary>
        /// Puts the report's own query terms onto the query that supplies the rows.
        ///
        /// Filters are appended; a grouped report additionally has its projection swapped in. A
        /// grouping that cannot be expressed against the supplied query is refused out loud, because
        /// the alternative is a page of ungrouped rows where a total was asked for — an answer that
        /// looks like data and is not.
        /// </summary>
        private static string Combine(string supplied, ReportQuery query)
        {
            var filtered = FetchXmlFilters.ApplyTo(supplied, query.FetchXml);
            if (!query.IsAggregate)
            {
                return filtered;
            }

            return FetchXmlAggregates.ApplyTo(filtered, query.FetchXml)
                ?? throw new InvalidPluginExecutionException(
                    "This report groups or totals a column the saved view brings in from another table, "
                    + "which cannot be grouped in the view's own query. Remove the aggregate, or read via "
                    + "FetchXML so the report builds the query itself.");
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
