using System;
using Microsoft.Xrm.Sdk;
using Qdb.ReportEngine.CrmPlugin.Infrastructure;
using Qdb.ReportEngine.CrmPlugin.Model;

namespace Qdb.ReportEngine.CrmPlugin
{
    /// <summary>
    /// The <c>qdb_RunReport</c> entry point (Custom API on cloud / Custom Action on on-prem). A thin,
    /// stateless proxy: it reads the request, confirms an authenticated caller, relays the run to the
    /// middle tier as that user, and returns the result. It never parses a definition, queries data,
    /// or renders output — that work (and the execution-log audit record) lives in the middle tier,
    /// keeping the plugin well within the 2-minute sandbox ceiling.
    /// </summary>
    /// <remarks>
    /// The unsecure configuration string may hold the middle-tier URL as a fallback when the
    /// <c>qdb_rpt_middle_tier_url</c> environment variable is not set.
    /// </remarks>
    public sealed class RunReportPlugin : IPlugin
    {
        private readonly string _unsecureConfig;

        public RunReportPlugin(string unsecureConfig, string secureConfig)
        {
            _unsecureConfig = unsecureConfig;
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null)
            {
                throw new ArgumentNullException(nameof(serviceProvider));
            }

            var context = Resolve<IPluginExecutionContext>(serviceProvider);
            var tracing = Resolve<ITracingService>(serviceProvider);
            var service = CreateOrganizationService(serviceProvider, context.UserId);

            try
            {
                Run(context, service, tracing);
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception error)
            {
                tracing.Trace("qdb_RunReport failed: {0}", error);
                throw new InvalidPluginExecutionException("The report run could not be completed.", error);
            }
        }

        private void Run(IPluginExecutionContext context, IOrganizationService service, ITracingService tracing)
        {
            var configuration = PluginConfiguration.Load(service, _unsecureConfig);
            var request = RunReportRequestReader.Read(context);

            if (request.Async)
            {
                // Async job orchestration is a separate build (middle-tier P-items); degrade to sync.
                tracing.Trace("Async requested but not yet supported; running synchronously.");
            }

            var result = MiddleTierClient.Run(configuration, request);
            WriteResponse(context, result);
        }

        private static void WriteResponse(IPluginExecutionContext context, RelayResult result)
        {
            var output = context.OutputParameters;
            output[ReportEngineParameters.ExecutionId] = Guid.NewGuid().ToString();
            output[ReportEngineParameters.Mode] = "SYNC";
            output[ReportEngineParameters.JobId] = string.Empty;
            output[ReportEngineParameters.StatusPollUrl] = string.Empty;
            output[ReportEngineParameters.ResultJson] = result.Succeeded ? result.Payload : string.Empty;
            output[ReportEngineParameters.ErrorCode] = result.ErrorCode ?? string.Empty;
            output[ReportEngineParameters.ErrorMessage] = result.ErrorMessage ?? string.Empty;
        }

        private static IOrganizationService CreateOrganizationService(IServiceProvider serviceProvider, Guid userId)
        {
            var factory = Resolve<IOrganizationServiceFactory>(serviceProvider);
            return factory.CreateOrganizationService(userId);
        }

        private static T Resolve<T>(IServiceProvider serviceProvider) => (T)serviceProvider.GetService(typeof(T));
    }
}
