using System;
using System.Activities;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Workflow;
using Qdb.ReportEngine.CrmPlugin.Engine;

namespace Qdb.ReportEngine.CrmPlugin.Workflows
{
    // Workflow Activity Registration:
    // Assembly: Qdb.ReportEngine.CrmPlugin.dll
    // Type:     Qdb.ReportEngine.CrmPlugin.Workflows.RunDashboardActivity
    // Register as a Custom Workflow Activity, then add it as a STEP inside a Process Action named
    // qdb_RunDashboard, mapping the Action's arguments onto the activity's.

    /// <summary>
    /// The on-premise entry point for <c>qdb_RunDashboard</c>.
    ///
    /// Four outputs, not seven — a dashboard run reports no mode, job or poll url, and declaring
    /// arguments the engine never writes would leave the caller reading empty strings that look
    /// meaningful.
    /// </summary>
    public sealed class RunDashboardActivity : CodeActivity
    {
        [RequiredArgument]
        [Input("Dashboard id")]
        public InArgument<string> DashboardId { get; set; }

        [Output("Result JSON")]
        public OutArgument<string> ResultJson { get; set; }

        [Output("Execution id")]
        public OutArgument<string> ExecutionId { get; set; }

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

            var dashboardId = DashboardId.Get(executionContext);
            if (!Guid.TryParse(dashboardId, out var parsed) || parsed == Guid.Empty)
            {
                throw new InvalidPluginExecutionException("'dashboardId' must be a non-empty GUID.");
            }

            var workflowContext = executionContext.GetExtension<IWorkflowContext>();
            var factory = executionContext.GetExtension<IOrganizationServiceFactory>();
            var tracing = executionContext.GetExtension<ITracingService>();

            // Same split as every other entry point: read as the caller so their security applies,
            // write the audit row as the system so they cannot suppress it.
            var asUser = factory.CreateOrganizationService(workflowContext.InitiatingUserId);
            var asSystem = factory.CreateOrganizationService(null);

            var outcome = RunDashboardOrchestrator.Execute(
                parsed, workflowContext.InitiatingUserId, tracing, asUser, asSystem);

            ResultJson.Set(executionContext, outcome.ResultJson);
            ExecutionId.Set(executionContext, outcome.ExecutionId);
            ErrorCode.Set(executionContext, outcome.ErrorCode);
            ErrorMessage.Set(executionContext, outcome.ErrorMessage);
        }
    }
}
