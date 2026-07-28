using System;
using System.Diagnostics;
using System.Text;
using Microsoft.Xrm.Sdk;
using Qdb.ReportEngine.CrmPlugin.Engine;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.CrmPlugin
{
    /// <summary>
    /// The <c>qdb_RunDashboard</c> entry point. Dashboards could be composed and saved but never run;
    /// this executes one and returns every widget's data.
    ///
    /// It is a plugin for the same reason report execution is: this is the call that writes the audit
    /// record, so a dashboard cannot return data unlogged. Widgets query as the initiating user, so
    /// each tile shows only what that user may see.
    /// </summary>
    public sealed class RunDashboardPlugin : IPlugin
    {
        public RunDashboardPlugin(string unsecureConfig, string secureConfig)
        {
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null)
            {
                throw new ArgumentNullException(nameof(serviceProvider));
            }

            var context = Resolve<IPluginExecutionContext>(serviceProvider);
            var tracing = Resolve<ITracingService>(serviceProvider);
            var factory = Resolve<IOrganizationServiceFactory>(serviceProvider);

            var asUser = factory.CreateOrganizationService(context.InitiatingUserId);
            var asSystem = factory.CreateOrganizationService(null);

            Run(context, tracing, asUser, new ExecutionLogWriter(asSystem, tracing));
        }

        private static void Run(
            IPluginExecutionContext context, ITracingService tracing,
            IOrganizationService asUser, ExecutionLogWriter log)
        {
            var dashboardId = ReadDashboardId(context);
            var entry = new ExecutionLogEntry
            {
                ReportName = dashboardId.ToString(),
                UserId = context.InitiatingUserId,
                CorrelationId = Guid.NewGuid().ToString("N"),
                StartedOn = DateTime.UtcNow
            };
            var clock = Stopwatch.StartNew();

            DashboardResult result = null;
            ReportFailureInfo failure = null;

            try
            {
                // As in a report run, each assignment marks the stage now in progress so a failure is
                // logged where it happened: a broken layout fails in LoadMetadata, a widget whose
                // query is refused fails in DataFetch.
                entry.Stage = ExecutionStage.LoadMetadata;
                var engine = new SdkDashboardEngine(asUser);
                var definition = engine.LoadDefinition(dashboardId);
                entry.ReportName = "Dashboard — " + definition.Title;
                entry.Stage = ExecutionStage.DataFetch;
                result = engine.Execute(definition);
                entry.RowCount = CountPoints(result);
                entry.Succeeded = true;
                entry.Stage = ExecutionStage.Complete;
            }
            catch (Exception error)
            {
                failure = ReportFailure.Classify(error);
                entry.ErrorCode = failure.Code;
                tracing.Trace("qdb_RunDashboard failed ({0}): {1}", failure.Code, error);
            }

            // Written before anything is returned, exactly as a report run is: no data without a trail.
            entry.DurationMs = (int)clock.ElapsedMilliseconds;
            log.Write(entry);

            var output = context.OutputParameters;
            output[ReportEngineParameters.ExecutionId] = entry.CorrelationId;
            output[ReportEngineParameters.ResultJson] = failure == null ? DashboardResultJson.Write(result) : string.Empty;
            output[ReportEngineParameters.ErrorCode] = failure?.Code ?? string.Empty;
            output[ReportEngineParameters.ErrorMessage] = failure?.Message ?? string.Empty;
        }

        /// <summary>Total data points across every widget — the closest thing to "rows" a dashboard has.</summary>
        private static int CountPoints(DashboardResult result)
        {
            var total = 0;
            foreach (var widget in result.Widgets) total += widget.Data.Count;
            return total;
        }

        private static Guid ReadDashboardId(IPluginExecutionContext context)
        {
            context.InputParameters.TryGetValue(ReportEngineParameters.DashboardId, out var value);
            if (!Guid.TryParse(value as string, out var id) || id == Guid.Empty)
            {
                throw new InvalidPluginExecutionException($"'{ReportEngineParameters.DashboardId}' must be a non-empty GUID.");
            }

            return id;
        }

        private static T Resolve<T>(IServiceProvider serviceProvider) => (T)serviceProvider.GetService(typeof(T));
    }

    /// <summary>
    /// Serialises a dashboard result. Hand-written for the same reason as the report writer: the
    /// plugin assembly must stay self-contained and net462 has no <c>System.Text.Json</c>.
    /// </summary>
    internal static class DashboardResultJson
    {
        public static string Write(DashboardResult result)
        {
            var json = new StringBuilder(512);
            json.Append("{\"dashboardId\":\"").Append(result.DashboardId).Append("\",\"widgets\":[");

            for (var index = 0; index < result.Widgets.Count; index++)
            {
                if (index > 0) json.Append(',');
                AppendWidget(json, result.Widgets[index]);
            }

            return json.Append("]}").ToString();
        }

        private static void AppendWidget(StringBuilder json, WidgetResult widget)
        {
            json.Append("{\"widgetId\":\"").Append(widget.WidgetId).Append('"');
            json.Append(",\"accessDenied\":").Append(widget.AccessDenied ? "true" : "false");

            if (widget.Error != null)
            {
                json.Append(",\"error\":{\"code\":");
                JsonText.Append(json, widget.Error.Code);
                json.Append(",\"message\":");
                JsonText.Append(json, widget.Error.Message);
                json.Append('}');
            }

            json.Append(",\"data\":[");
            for (var index = 0; index < widget.Data.Count; index++)
            {
                if (index > 0) json.Append(',');
                json.Append("{\"label\":");
                JsonText.Append(json, widget.Data[index].Label);
                json.Append(",\"value\":").Append(widget.Data[index].Value.ToString(System.Globalization.CultureInfo.InvariantCulture));
                json.Append('}');
            }

            json.Append("]}");
        }
    }
}
