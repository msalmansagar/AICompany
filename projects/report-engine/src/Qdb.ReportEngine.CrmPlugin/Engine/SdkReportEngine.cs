using System;
using System.Collections.Generic;
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

        public ReportResult Execute(ReportDefinition definition, ReportExecutionRequest request)
        {
            var query = ReportQueryBuilder.Build(definition, request);
            var rows = Retrieve(query.FetchXml);

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

        private IReadOnlyList<IReadOnlyDictionary<string, object>> Retrieve(string fetchXml) =>
            SdkRowAdapter.ToRows(_asUser.RetrieveMultiple(new FetchExpression(fetchXml)));

        private static IReadOnlyDictionary<string, object> FirstOrNull(
            IReadOnlyList<IReadOnlyDictionary<string, object>> rows) => rows.Count > 0 ? rows[0] : null;
    }
}
