using System;
using System.Activities;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Workflow;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Serialization;
using Qdb.FormEngine.Data;
using Qdb.FormEngine.Plugins;

namespace Qdb.FormEngine.Workflows
{
    // Workflow Activity Registration:
    // Assembly: Qdb.FormEngine.Workflows.dll
    // Type:     Qdb.FormEngine.Workflows.PublishFormActivity
    // Register as Custom Workflow Activity via Plugin Registration Tool
    // Invoke from a CRM Process Action (on-prem) with three input parameters:
    //   FormCode      (string) — qdb_form_code of the form to publish
    //   TargetVersion (int)    — version number to generate
    //   PublishJobId  (string) — GUID of the pre-created qdb_publish_job record

    /// <summary>
    /// Custom Workflow Activity (CodeActivity) that runs the form publish pipeline
    /// from a CRM on-premise Process Action. Delegates all logic to
    /// <see cref="PublishOrchestrator"/> so the pipeline is identical to the
    /// <see cref="Qdb.FormEngine.Plugins.PublishFormPlugin"/> async plugin.
    /// </summary>
    public sealed class PublishFormActivity : CodeActivity
    {
        private const string DEFAULT_GENERATOR_VERSION = "1.0.0";

        /// <summary>
        /// The unique form code identifying the form definition to publish.
        /// </summary>
        [RequiredArgument]
        public InArgument<string> FormCode { get; set; }

        /// <summary>
        /// The form definition version number being targeted by this publish run.
        /// </summary>
        [RequiredArgument]
        public InArgument<int> TargetVersion { get; set; }

        /// <summary>
        /// GUID (as string) of the pre-created qdb_publish_job record that tracks this run.
        /// </summary>
        [RequiredArgument]
        public InArgument<string> PublishJobId { get; set; }

        /// <summary>
        /// Executes the publish pipeline. Called by the CRM workflow engine.
        /// </summary>
        /// <param name="executionContext">The WF CodeActivity execution context.</param>
        protected override void Execute(CodeActivityContext executionContext)
        {
            if (executionContext == null)
                throw new InvalidPluginExecutionException("executionContext must not be null.");

            var workflowContext = executionContext.GetExtension<IWorkflowContext>();
            var serviceFactory = executionContext.GetExtension<IOrganizationServiceFactory>();
            var tracingService = executionContext.GetExtension<ITracingService>();

            var service = serviceFactory.CreateOrganizationService(workflowContext.UserId);

            var formCode = FormCode.Get(executionContext);
            var targetVersion = TargetVersion.Get(executionContext);
            var publishJobIdStr = PublishJobId.Get(executionContext);

            tracingService.Trace("PublishFormActivity: FormCode={0}, TargetVersion={1}, PublishJobId={2}",
                formCode, targetVersion, publishJobIdStr);

            ValidateInputs(formCode, publishJobIdStr, tracingService);

            Guid publishJobId;
            if (!Guid.TryParse(publishJobIdStr, out publishJobId))
            {
                tracingService.Trace("Invalid PublishJobId: {0}", publishJobIdStr);
                throw new InvalidPluginExecutionException(string.Format(
                    "PublishJobId '{0}' is not a valid GUID.", publishJobIdStr));
            }

            var orchestrator = BuildOrchestrator(service, tracingService);

            try
            {
                orchestrator.Publish(formCode, targetVersion, publishJobId);
                tracingService.Trace("PublishFormActivity: publish complete for '{0}'.", formCode);
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                tracingService.Trace("PublishFormActivity unexpected error: {0}", ex.ToString());
                throw new InvalidPluginExecutionException(
                    string.Format("Publish failed for form '{0}': {1}", formCode, ex.Message), ex);
            }
        }

        private static void ValidateInputs(string formCode, string publishJobIdStr, ITracingService tracingService)
        {
            if (string.IsNullOrWhiteSpace(formCode))
            {
                tracingService.Trace("FormCode is null or empty.");
                throw new InvalidPluginExecutionException("FormCode must not be null or empty.");
            }
            if (string.IsNullOrWhiteSpace(publishJobIdStr))
            {
                tracingService.Trace("PublishJobId is null or empty.");
                throw new InvalidPluginExecutionException("PublishJobId must not be null or empty.");
            }
        }

        private static PublishOrchestrator BuildOrchestrator(IOrganizationService service, ITracingService tracingService)
        {
            return new PublishOrchestrator(
                new CrmMetadataReader(service, tracingService),
                new PublishJobRepository(service),
                new RenderCacheRepository(service),
                new FormJsonGenerator(new TranslationResolver(), tracingService),
                new SecurityStripper(),
                new NewtonsoftJsonSerializer(),
                tracingService,
                DEFAULT_GENERATOR_VERSION);
        }
    }
}
