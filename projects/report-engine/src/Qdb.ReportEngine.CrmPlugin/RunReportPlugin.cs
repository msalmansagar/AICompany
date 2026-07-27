using System;
using System.Diagnostics;
using Microsoft.Xrm.Sdk;
using Qdb.ReportEngine.CrmPlugin.Engine;
using Qdb.ReportEngine.CrmPlugin.Infrastructure;
using Qdb.ReportEngine.CrmPlugin.Model;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.CrmPlugin
{
    /// <summary>
    /// The <c>qdb_RunReport</c> entry point — the Report Engine's data path (ADR-RPT-011).
    ///
    /// It loads the stored definition, builds FetchXML from it, executes as the calling user, writes
    /// the execution audit record, and returns the rows as JSON. Everything presentational —
    /// formulas, transformations, layout, charts and exports — happens in the web resource that
    /// called it.
    ///
    /// Retrieval lives here rather than in the browser for one reason: it makes the audit record
    /// unavoidable. The call that returns rows is the call that writes the log, so report output
    /// cannot be obtained without being recorded.
    /// </summary>
    public sealed class RunReportPlugin : IPlugin
    {
        public RunReportPlugin(string unsecureConfig, string secureConfig)
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

            // Queries run as the initiating user so Dataverse applies their row-level security; the
            // audit record is written as the system so the user cannot suppress or alter it.
            var asUser = factory.CreateOrganizationService(context.InitiatingUserId);
            var asSystem = factory.CreateOrganizationService(null);

            Run(context, tracing, asUser, new ExecutionLogWriter(asSystem, tracing));
        }

        private static void Run(
            IPluginExecutionContext context,
            ITracingService tracing,
            IOrganizationService asUser,
            ExecutionLogWriter log)
        {
            var request = RunReportRequestReader.Read(context);
            var entry = NewLogEntry(request.ReportId, context.InitiatingUserId);
            var clock = Stopwatch.StartNew();

            ReportResult result = null;
            ReportFailureInfo failure = null;

            try
            {
                result = ExecuteReport(asUser, request, entry);
                entry.RowCount = result.RowCount;
                entry.Succeeded = true;
            }
            catch (Exception error)
            {
                failure = ReportFailure.Classify(error);
                entry.ErrorCode = failure.Code;
                // The full exception goes to the trace log for support; the caller gets the safe text.
                tracing.Trace("qdb_RunReport failed ({0}): {1}", failure.Code, error);
            }

            // The audit record is written BEFORE the caller is given anything, and a failure to write
            // it throws — so there is no path that returns report data without a recorded execution.
            entry.DurationMs = (int)clock.ElapsedMilliseconds;
            log.Write(entry);

            if (failure == null)
            {
                WriteSuccess(context, result);
            }
            else
            {
                WriteFailure(context, failure.Code, failure.Message);
            }
        }

        private static ReportResult ExecuteReport(
            IOrganizationService asUser, RunReportRequest request, ExecutionLogEntry entry)
        {
            var engine = new SdkReportEngine(asUser);
            var definition = engine.LoadDefinition(request.ReportId);
            entry.ReportName = definition.Name;

            // A drilldown is a distinct execution over related rows, so it is logged as its own entry
            // rather than folded into the parent's — "who saw which child records" is the question the
            // audit trail has to answer.
            if (request.IsDrilldown)
            {
                entry.ReportName = definition.Name + " — drilldown";
                return engine.ExecuteDrilldown(definition, request.RelationshipId, request.ParentKey);
            }

            return engine.Execute(definition, new ReportExecutionRequest
            {
                ParameterValues = ReportParameters.Parse(request.ParametersJson)
            });
        }

        private static ExecutionLogEntry NewLogEntry(Guid reportId, Guid userId) => new ExecutionLogEntry
        {
            ReportId = reportId,
            ReportName = reportId.ToString(),
            UserId = userId,
            CorrelationId = Guid.NewGuid().ToString("N"),
            StartedOn = DateTime.UtcNow
        };

        private static void WriteSuccess(IPluginExecutionContext context, ReportResult result)
        {
            WriteCommon(context);
            context.OutputParameters[ReportEngineParameters.ResultJson] = ReportResultJson.Write(result);
            context.OutputParameters[ReportEngineParameters.ErrorCode] = string.Empty;
            context.OutputParameters[ReportEngineParameters.ErrorMessage] = string.Empty;
        }

        private static void WriteFailure(IPluginExecutionContext context, string errorCode, string message)
        {
            WriteCommon(context);
            context.OutputParameters[ReportEngineParameters.ResultJson] = string.Empty;
            context.OutputParameters[ReportEngineParameters.ErrorCode] = errorCode;
            context.OutputParameters[ReportEngineParameters.ErrorMessage] = message;
        }

        private static void WriteCommon(IPluginExecutionContext context)
        {
            var output = context.OutputParameters;
            output[ReportEngineParameters.ExecutionId] = Guid.NewGuid().ToString();
            output[ReportEngineParameters.Mode] = "SYNC";
            output[ReportEngineParameters.JobId] = string.Empty;
            output[ReportEngineParameters.StatusPollUrl] = string.Empty;
        }

        private static T Resolve<T>(IServiceProvider serviceProvider) => (T)serviceProvider.GetService(typeof(T));
    }
}
