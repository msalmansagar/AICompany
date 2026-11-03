using System;
using System.Collections.Generic;
using System.Globalization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Execution.Dataverse;

namespace Qdb.ReportEngine.CrmPlugin.Engine
{
    /// <summary>
    /// Runs a stored dashboard: load its widgets, resolve each one's aggregate query, and return the
    /// data points. Dashboards could be composed and saved but never executed anywhere.
    ///
    /// Widgets resolve one after another rather than in parallel. The retired middle tier fanned out
    /// with a semaphore and a coalescer (ADR-RPT-008), but that design existed to stop one shared
    /// server flooding Dataverse on behalf of every user at once. Here each user's own session issues
    /// its own queries, which is what that design was trying to approximate, and a plugin has a
    /// two-minute ceiling that parallelism inside the sandbox would not obviously improve.
    ///
    /// A widget that fails does not fail the dashboard: it comes back carrying its error, so one
    /// broken tile cannot cost the user every other one. Access denials are reported distinctly, so
    /// the client can show "no access" rather than an empty chart (AUTH-C-8).
    /// </summary>
    internal sealed class SdkDashboardEngine
    {
        private readonly IOrganizationService _asUser;

        public SdkDashboardEngine(IOrganizationService asUser) => _asUser = asUser;

        public DashboardDefinition LoadDefinition(Guid dashboardId)
        {
            var dashboard = FirstOrNull(Retrieve(DashboardDefinitionFetch.Dashboard(dashboardId)));
            if (dashboard == null)
            {
                throw new InvalidPluginExecutionException($"Dashboard {dashboardId} was not found.");
            }

            var widgetsBySection = new Dictionary<Guid, List<DashboardWidget>>();
            foreach (var row in Retrieve(DashboardDefinitionFetch.Widgets(dashboardId)))
            {
                var sectionId = RowReader.Guid(row, "qdb_dashboardsectionid") ?? Guid.Empty;
                if (!widgetsBySection.TryGetValue(sectionId, out var list))
                {
                    list = new List<DashboardWidget>();
                    widgetsBySection[sectionId] = list;
                }

                list.Add(MapWidget(row));
            }

            var sections = new List<DashboardSection>();
            foreach (var row in Retrieve(DashboardDefinitionFetch.Sections(dashboardId)))
            {
                var id = RowReader.Guid(row, "qdb_dashboardsectionid") ?? Guid.Empty;
                sections.Add(new DashboardSection
                {
                    Id = id,
                    Title = RowReader.String(row, "qdb_dashboardsectionname"),
                    Columns = RowReader.IntOrZero(row, "qdb_columns"),
                    Sequence = RowReader.IntOrZero(row, "qdb_sequence"),
                    Widgets = widgetsBySection.TryGetValue(id, out var widgets) ? widgets : new List<DashboardWidget>()
                });
            }

            return new DashboardDefinition
            {
                Id = RowReader.Guid(dashboard, "qdb_dashboardid") ?? dashboardId,
                Title = RowReader.String(dashboard, "qdb_dashboardname") ?? string.Empty,
                IsGoverned = RowReader.Bool(dashboard, "qdb_isgoverned"),
                Sections = sections
            };
        }

        public DashboardResult Execute(DashboardDefinition definition)
        {
            var results = new List<WidgetResult>();
            foreach (var section in definition.Sections)
            {
                foreach (var widget in section.Widgets)
                {
                    results.Add(ExecuteWidget(widget));
                }
            }

            return new DashboardResult { DashboardId = definition.Id, Widgets = results };
        }

        private WidgetResult ExecuteWidget(DashboardWidget widget)
        {
            try
            {
                var rows = Retrieve(FetchXmlAggregateBuilder.Build(widget));
                return new WidgetResult { WidgetId = widget.Id, Data = ToDataPoints(widget, rows) };
            }
            catch (System.ServiceModel.FaultException<OrganizationServiceFault> fault)
            {
                // Denied is a distinct outcome from broken: the client shows "no access", not an error.
                var denied = ReportFailure.Classify(fault).Code == ReportFailure.PermissionDenied;
                return new WidgetResult
                {
                    WidgetId = widget.Id,
                    AccessDenied = denied,
                    Error = denied ? null : DomainError.QueryFailed(widget.Entity)
                };
            }
            catch (Exception)
            {
                return new WidgetResult { WidgetId = widget.Id, Error = DomainError.QueryFailed(widget.Entity) };
            }
        }

        /// <summary>The aliases FetchXmlAggregateBuilder gives the grouping column and the measure.</summary>
        private const string GroupAlias = "group";
        private const string ValueAlias = "value";
        private const string FormattedSuffix = "@OData.Community.Display.V1.FormattedValue";

        /// <summary>
        /// The aggregate query returns one row per group. An ungrouped widget yields a single point,
        /// which is what a metric or gauge renders.
        ///
        /// The label prefers the formatted value, so grouping by a choice column reads "Active" rather
        /// than 0 — a chart legend of raw option-set codes is unreadable.
        /// </summary>
        private static IReadOnlyList<DataPoint> ToDataPoints(
            DashboardWidget widget, IReadOnlyList<IReadOnlyDictionary<string, object>> rows)
        {
            var points = new List<DataPoint>();
            foreach (var row in rows)
            {
                var label = widget.GroupByAttribute == null
                    ? (widget.Title ?? "Total")
                    : RowReader.String(row, GroupAlias + FormattedSuffix)
                      ?? RowReader.String(row, GroupAlias)
                      ?? "(blank)";
                points.Add(new DataPoint(label, ReadDecimal(row, ValueAlias)));
            }

            return points;
        }

        private static decimal ReadDecimal(IReadOnlyDictionary<string, object> row, string key)
        {
            var text = RowReader.String(row, key);
            return decimal.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : 0m;
        }

        private static DashboardWidget MapWidget(IReadOnlyDictionary<string, object> row) => new DashboardWidget
        {
            Id = RowReader.Guid(row, "qdb_dashboardwidgetid") ?? Guid.Empty,
            Kind = ParseEnum(RowReader.String(row, "qdb_kind"), WidgetKind.Metric),
            Entity = RowReader.String(row, "qdb_entity") ?? string.Empty,
            GroupByAttribute = Blank(RowReader.String(row, "qdb_groupby")),
            MeasureAttribute = Blank(RowReader.String(row, "qdb_measure")),
            Aggregation = ParseEnum(RowReader.String(row, "qdb_aggregation"), Aggregation.Sum),
            Title = RowReader.String(row, "qdb_dashboardwidgetname"),
            ChartType = RowReader.String(row, "qdb_charttype"),
            Sequence = RowReader.IntOrZero(row, "qdb_sequence")
        };

        // Kind and aggregation are stored as strings to avoid option-set churn as the catalogue grows.
        private static T ParseEnum<T>(string value, T fallback) where T : struct =>
            !string.IsNullOrEmpty(value) && Enum.TryParse<T>(value, true, out var parsed) ? parsed : fallback;

        private static string Blank(string value) => string.IsNullOrWhiteSpace(value) ? null : value;

        private IReadOnlyList<IReadOnlyDictionary<string, object>> Retrieve(string fetchXml) =>
            SdkRowAdapter.ToRows(_asUser.RetrieveMultiple(new FetchExpression(fetchXml)));

        private static IReadOnlyDictionary<string, object> FirstOrNull(
            IReadOnlyList<IReadOnlyDictionary<string, object>> rows) => rows.Count > 0 ? rows[0] : null;
    }
}
