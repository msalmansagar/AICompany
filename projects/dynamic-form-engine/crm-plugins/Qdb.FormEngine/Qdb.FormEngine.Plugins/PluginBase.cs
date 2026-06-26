using System;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json;

namespace Qdb.FormEngine.Plugins
{
    /// <summary>
    /// Abstract base class for all Qdb.FormEngine plugins.
    /// Extracts standard CRM services from the service provider, parses secure config,
    /// and wraps execution in a consistent try/catch that converts unknown exceptions
    /// to <see cref="InvalidPluginExecutionException"/>.
    /// </summary>
    public abstract class PluginBase : IPlugin
    {
        private readonly string _secureConfig;

        /// <summary>
        /// Semantic version of the generator read from secure config.
        /// Defaults to "1.0.0" when not supplied.
        /// </summary>
        protected string GeneratorVersion { get; private set; }

        /// <summary>
        /// Default language code read from secure config.
        /// Defaults to "en" when not supplied.
        /// </summary>
        protected string DefaultLanguageCode { get; private set; }

        /// <summary>
        /// Initialises a new instance with the secure config string supplied by CRM registration.
        /// </summary>
        /// <param name="secureConfig">JSON secure config: {"generatorVersion":"1.0.0","defaultLanguageCode":"en"}</param>
        protected PluginBase(string secureConfig)
        {
            _secureConfig = secureConfig;
            ParseSecureConfig(secureConfig);
        }

        /// <summary>
        /// Entry point called by the CRM plugin pipeline.
        /// Extracts services, then delegates to <see cref="Execute(LocalPluginContext)"/>.
        /// </summary>
        /// <param name="serviceProvider">CRM service provider from the plugin pipeline.</param>
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null)
                throw new InvalidPluginExecutionException("serviceProvider must not be null.");

            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracingService = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            var localContext = new LocalPluginContext(context, service, tracingService);

            try
            {
                Execute(localContext);
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                tracingService.Trace("Unhandled exception in {0}: {1}", GetType().Name, ex.ToString());
                throw new InvalidPluginExecutionException(
                    string.Format("An unexpected error occurred in {0}. See plugin trace log for details.", GetType().Name), ex);
            }
        }

        /// <summary>
        /// Derived plugins implement their business logic here.
        /// </summary>
        /// <param name="context">Resolved local plugin context with all CRM services.</param>
        protected abstract void Execute(LocalPluginContext context);

        private void ParseSecureConfig(string json)
        {
            GeneratorVersion = "1.0.0";
            DefaultLanguageCode = "en";

            if (string.IsNullOrWhiteSpace(json)) return;

            try
            {
                var config = JsonConvert.DeserializeObject<SecureConfigModel>(json);
                if (config == null) return;
                if (!string.IsNullOrWhiteSpace(config.GeneratorVersion))
                    GeneratorVersion = config.GeneratorVersion;
                if (!string.IsNullOrWhiteSpace(config.DefaultLanguageCode))
                    DefaultLanguageCode = config.DefaultLanguageCode;
            }
            catch
            {
                // Secure config parse failures fall back to defaults silently.
                // The plugin will still run; trace logging captures the issue.
            }
        }

        /// <summary>
        /// Carries all resolved CRM services for a single plugin execution.
        /// Passed as a single parameter object to <see cref="PluginBase.Execute(LocalPluginContext)"/>.
        /// </summary>
        public sealed class LocalPluginContext
        {
            /// <summary>The CRM plugin execution context.</summary>
            public IPluginExecutionContext Context { get; }

            /// <summary>An organisation service running as the initiating user.</summary>
            public IOrganizationService OrganizationService { get; }

            /// <summary>The CRM tracing service for diagnostic output.</summary>
            public ITracingService TracingService { get; }

            /// <summary>
            /// Initialises a new <see cref="LocalPluginContext"/>.
            /// </summary>
            public LocalPluginContext(IPluginExecutionContext context, IOrganizationService service, ITracingService tracingService)
            {
                Context = context ?? throw new ArgumentNullException("context");
                OrganizationService = service ?? throw new ArgumentNullException("service");
                TracingService = tracingService ?? throw new ArgumentNullException("tracingService");
            }
        }

        private sealed class SecureConfigModel
        {
            [JsonProperty("generatorVersion")]
            public string GeneratorVersion { get; set; }

            [JsonProperty("defaultLanguageCode")]
            public string DefaultLanguageCode { get; set; }
        }
    }
}
