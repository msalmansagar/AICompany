using System;
using System.Activities;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Workflow;
using Qdb.ReportEngine.CrmPlugin.Engine;
using Qdb.ReportEngine.CrmPlugin.Model;

namespace Qdb.ReportEngine.CrmPlugin.Workflows
{
    // Workflow Activity Registration:
    // Assembly: Qdb.ReportEngine.CrmPlugin.dll
    // Type:     Qdb.ReportEngine.CrmPlugin.Workflows.RunReportActivity
    // Register as a Custom Workflow Activity with the Plugin Registration Tool, then add it as a
    // STEP inside a Process Action named qdb_RunReport, mapping the Action's arguments onto the
    // activity's. No plugin step is registered on the message itself.

    /// <summary>
    /// The on-premise entry point for <c>qdb_RunReport</c>.
    ///
    /// Dynamics 365 on-premise 9.1 has no Custom API, so the message the browser calls has to be a
    /// Process Action, and the work inside it a Custom Workflow Activity. This is that activity. It
    /// reads its arguments, hands them to <see cref="RunReportOrchestrator"/> — the same code the
    /// cloud plugin runs — and writes the results back out.
    ///
    /// Nothing about report execution lives here. If logic starts accumulating in this class it has
    /// diverged from the cloud path, which is exactly what the orchestrator exists to prevent.
    /// </summary>
    public sealed class RunReportActivity : CodeActivity
    {
        [RequiredArgument]
        [Input("Report id")]
        public InArgument<string> ReportId { get; set; }

        [Input("Parameters JSON")]
        public InArgument<string> ParametersJson { get; set; }

        [Input("Format")]
        public InArgument<string> Format { get; set; }

        [Input("Async")]
        public InArgument<bool> Async { get; set; }

        [Input("Relationship id")]
        public InArgument<string> RelationshipId { get; set; }

        [Input("Parent key")]
        public InArgument<string> ParentKey { get; set; }

        [Output("Result JSON")]
        public OutArgument<string> ResultJson { get; set; }

        [Output("Execution id")]
        public OutArgument<string> ExecutionId { get; set; }

        [Output("Mode")]
        public OutArgument<string> Mode { get; set; }

        [Output("Job id")]
        public OutArgument<string> JobId { get; set; }

        [Output("Status poll url")]
        public OutArgument<string> StatusPollUrl { get; set; }

        [Output("Error code")]
        public OutArgument<string> ErrorCode { get; set; }

        [Output("Error message")]
        public OutArgument<string> ErrorMessage { get; set; }

        protected override void Execute(CodeActivityContext executionContext)
        {
            if (executionContext == null)
            {
                throw new InvalidPluginExecutionException("executionContext must not be null.");
            }

            var workflowContext = executionContext.GetExtension<IWorkflowContext>();
            var factory = executionContext.GetExtension<IOrganizationServiceFactory>();
            var tracing = executionContext.GetExtension<ITracingService>();

            // Queries run as the initiating user so the platform applies their row-level security;
            // the audit record is written as the system so the user cannot suppress it. Identical to
            // the cloud plugin, and the reason it is identical is that it is the same rule.
            var asUser = factory.CreateOrganizationService(workflowContext.InitiatingUserId);
            var asSystem = factory.CreateOrganizationService(null);

            var request = ReadRequest(executionContext, workflowContext.InitiatingUserId);
            var outcome = RunReportOrchestrator.Execute(
                request, tracing, asUser,
                new ExecutionLogWriter(asSystem, tracing),
                new ReportAccessGuard(asSystem));

            ResultJson.Set(executionContext, outcome.ResultJson);
            ExecutionId.Set(executionContext, outcome.ExecutionId);
            Mode.Set(executionContext, outcome.Mode);
            JobId.Set(executionContext, outcome.JobId);
            StatusPollUrl.Set(executionContext, outcome.StatusPollUrl);
            ErrorCode.Set(executionContext, outcome.ErrorCode);
            ErrorMessage.Set(executionContext, outcome.ErrorMessage);
        }

        private RunReportRequest ReadRequest(CodeActivityContext context, Guid callerId)
        {
            var reportId = ReportId.Get(context);
            if (!Guid.TryParse(reportId, out var parsed) || parsed == Guid.Empty)
            {
                throw new InvalidPluginExecutionException("'reportId' must be a non-empty GUID.");
            }

            return new RunReportRequest(
                parsed,
                callerId,
                ParametersJson.Get(context),
                ReportFormatExtensions.Parse(Format.Get(context)),
                Async.Get(context))
            {
                // Empty for an ordinary run; both set together when drilling into related rows.
                RelationshipId = Guid.TryParse(RelationshipId.Get(context), out var relationship)
                    ? relationship
                    : Guid.Empty,
                ParentKey = ParentKey.Get(context)
            };
        }
    }
}
