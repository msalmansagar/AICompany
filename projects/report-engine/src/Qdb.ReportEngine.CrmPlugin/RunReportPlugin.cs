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

            Run(context, tracing, asUser, new ExecutionLogWriter(asSystem, tracing),
                new ReportAccessGuard(asSystem), context.InitiatingUserId);
        }

        private static void Run(
            IPluginExecutionContext context,
            ITracingService tracing,
            IOrganizationService asUser,
            ExecutionLogWriter log,
            ReportAccessGuard guard,
            Guid callerId)
        {
            // The work itself lives in RunReportOrchestrator, which knows nothing about how it was
            // invoked. On-premise reaches the same code through RunReportActivity, so the audit
            // rules and the access check cannot drift between the two platforms.
            var outcome = RunReportOrchestrator.Execute(
                RunReportRequestReader.Read(context), tracing, asUser, log, guard);

            var output = context.OutputParameters;
            output[ReportEngineParameters.ResultJson] = outcome.ResultJson;
            output[ReportEngineParameters.ExecutionId] = outcome.ExecutionId;
            output[ReportEngineParameters.Mode] = outcome.Mode;
            output[ReportEngineParameters.JobId] = outcome.JobId;
            output[ReportEngineParameters.StatusPollUrl] = outcome.StatusPollUrl;
            output[ReportEngineParameters.ErrorCode] = outcome.ErrorCode;
            output[ReportEngineParameters.ErrorMessage] = outcome.ErrorMessage;
        }

        private static T Resolve<T>(IServiceProvider serviceProvider) => (T)serviceProvider.GetService(typeof(T));
    }
}
