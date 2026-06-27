using System;
using Microsoft.Xrm.Sdk;
using Qdb.FormEngine.Data;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Serialization;

namespace Qdb.FormEngine.Plugins
{
    // Plugin Registration:
    // Entity:         none (Custom API / Process Action)
    // Message:        qdb_PublishForm
    // Stage:          40 (PostOperation)
    // Mode:           Asynchronous
    // Secure Config:  {"generatorVersion":"1.0.0","defaultLanguageCode":"en"}
    // Input Parameters:
    //   FormCode       (string)  — qdb_form_code of the form to publish
    //   TargetVersion  (int)     — version number being published
    //   PublishJobId   (string)  — GUID of the pre-created qdb_publish_job record

    /// <summary>
    /// Asynchronous PostOperation plugin that drives the form publish pipeline.
    /// Triggered by the qdb_PublishForm Custom API (cloud) or Process Action (on-prem).
    /// Reads all form metadata, generates per-language JSON caches, and tracks progress
    /// on the publish job record. All heavy work is done inside the async job; never
    /// blocks the initiating transaction.
    /// </summary>
    public sealed class PublishFormPlugin : PluginBase
    {
        /// <summary>
        /// Initialises a new instance with the secure config supplied during plugin registration.
        /// </summary>
        /// <param name="secureConfig">JSON: {"generatorVersion":"1.0.0","defaultLanguageCode":"en"}</param>
        public PublishFormPlugin(string secureConfig) : base(secureConfig) { }

        /// <summary>
        /// Runs the form publish pipeline for all active languages.
        /// </summary>
        /// <param name="context">The resolved plugin context.</param>
        protected override void Execute(LocalPluginContext context)
        {
            var formCode = ReadRequiredStringParameter(context, "FormCode");
            var targetVersion = ReadIntParameter(context, "TargetVersion");
            var publishJobIdStr = ReadOptionalStringParameter(context, "PublishJobId");

            context.TracingService.Trace("PublishFormPlugin: FormCode={0}, TargetVersion={1}, PublishJobId={2}",
                formCode, targetVersion, string.IsNullOrEmpty(publishJobIdStr) ? "(auto-create)" : publishJobIdStr);

            // PublishJobId is optional: when omitted (e.g. invoked from a command button),
            // the orchestrator creates the publish job itself once the form is resolved.
            var publishJobId = Guid.Empty;
            if (!string.IsNullOrWhiteSpace(publishJobIdStr) && !Guid.TryParse(publishJobIdStr, out publishJobId))
            {
                context.TracingService.Trace("Invalid PublishJobId: {0}", publishJobIdStr);
                throw new InvalidPluginExecutionException(string.Format(
                    "PublishJobId '{0}' is not a valid GUID.", publishJobIdStr));
            }

            var orchestrator = BuildOrchestrator(context);
            orchestrator.Publish(formCode, targetVersion, publishJobId);

            context.TracingService.Trace("PublishFormPlugin: publish complete for '{0}'.", formCode);
        }

        private PublishOrchestrator BuildOrchestrator(LocalPluginContext context)
        {
            var service = context.OrganizationService;
            return new PublishOrchestrator(
                new CrmMetadataReader(service),
                new PublishJobRepository(service),
                new RenderCacheRepository(service),
                new Core.Generation.FormJsonGenerator(new TranslationResolver(), context.TracingService),
                new SecurityStripper(),
                new NewtonsoftJsonSerializer(),
                context.TracingService,
                GeneratorVersion);
        }

        private static string ReadRequiredStringParameter(LocalPluginContext context, string parameterName)
        {
            if (!context.Context.InputParameters.Contains(parameterName))
            {
                context.TracingService.Trace("Missing required input parameter: {0}", parameterName);
                throw new InvalidPluginExecutionException(string.Format(
                    "Required input parameter '{0}' was not provided.", parameterName));
            }
            var value = context.Context.InputParameters[parameterName] as string;
            if (string.IsNullOrWhiteSpace(value))
            {
                context.TracingService.Trace("Input parameter '{0}' is null or empty.", parameterName);
                throw new InvalidPluginExecutionException(string.Format(
                    "Input parameter '{0}' must not be null or empty.", parameterName));
            }
            return value;
        }

        private static string ReadOptionalStringParameter(LocalPluginContext context, string parameterName)
        {
            if (!context.Context.InputParameters.Contains(parameterName))
                return null;
            return context.Context.InputParameters[parameterName] as string;
        }

        private static int ReadIntParameter(LocalPluginContext context, string parameterName)
        {
            if (!context.Context.InputParameters.Contains(parameterName))
                return 0;
            var raw = context.Context.InputParameters[parameterName];
            if (raw is int) return (int)raw;
            int parsed;
            if (raw != null && int.TryParse(raw.ToString(), out parsed))
                return parsed;
            return 0;
        }
    }
}
