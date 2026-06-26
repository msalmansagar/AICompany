using System;
using System.Text;
using Microsoft.Xrm.Sdk;
using Qdb.FormEngine.Core.Serialization;
using Qdb.FormEngine.Data;

namespace Qdb.FormEngine.Plugins
{
    // Plugin Registration:
    // Entity:         none (Custom API / Process Action)
    // Message:        qdb_GetPublishedFormJson
    // Stage:          40 (PostOperation)
    // Mode:           Synchronous
    // Secure Config:  {"generatorVersion":"1.0.0","defaultLanguageCode":"en"}
    // Input Parameters:
    //   FormCode      (string) — qdb_form_code of the form to retrieve
    //   LanguageCode  (string) — two-letter language code, default "en"
    //   Version       (int)    — form version, 0 = latest active
    // Output Parameters:
    //   RuntimeJson   (string) — decompressed JSON string of the rendered form

    /// <summary>
    /// Synchronous PostOperation plugin that reads the Base64-encoded gzip payload
    /// from the Memo column qdb_runtime_json, decodes it, decompresses it, and returns
    /// the plain JSON string in OutputParameters["RuntimeJson"].
    /// Falls back to the default language when the requested language cache is absent.
    /// Never generates — reads pre-built cache only.
    /// </summary>
    public sealed class GetPublishedFormJsonPlugin : PluginBase
    {
        /// <summary>
        /// Initialises a new instance with the secure config supplied during plugin registration.
        /// </summary>
        /// <param name="secureConfig">JSON: {"generatorVersion":"1.0.0","defaultLanguageCode":"en"}</param>
        public GetPublishedFormJsonPlugin(string secureConfig) : base(secureConfig) { }

        /// <summary>
        /// Resolves the active cache record, reads the Base64 Memo column, decodes and
        /// decompresses, then sets the RuntimeJson output parameter.
        /// </summary>
        /// <param name="context">The resolved plugin context.</param>
        protected override void Execute(LocalPluginContext context)
        {
            var formCode = ReadRequiredStringParameter(context, "FormCode");
            var languageCode = ReadStringParameter(context, "LanguageCode", DefaultLanguageCode);
            var version = ReadIntParameter(context, "Version");

            context.TracingService.Trace("GetPublishedFormJsonPlugin: FormCode={0}, Language={1}, Version={2}",
                formCode, languageCode, version);

            var cacheRepository = new RenderCacheRepository(context.OrganizationService);
            var cacheEntity = FindCache(cacheRepository, formCode, version, languageCode, context);

            context.TracingService.Trace("Cache record found: {0}. Reading Memo column.", cacheEntity.Id);

            var runtimeJson = ReadAndDecompressJson(cacheEntity, formCode, version, context);

            context.Context.OutputParameters["RuntimeJson"] = runtimeJson;
            context.TracingService.Trace("RuntimeJson set, length={0} chars.", runtimeJson.Length);
        }

        private string ReadAndDecompressJson(
            Entity cacheEntity,
            string formCode,
            int version,
            LocalPluginContext context)
        {
            var base64Json = cacheEntity.GetAttributeValue<string>("qdb_runtime_json");
            if (string.IsNullOrWhiteSpace(base64Json))
            {
                context.TracingService.Trace(
                    "qdb_runtime_json is empty on cache record {0} for form '{1}' version {2}.",
                    cacheEntity.Id, formCode, version);
                throw new InvalidPluginExecutionException(string.Format(
                    "Cache record for form '{0}' version {1} exists but contains no JSON payload. " +
                    "Re-publish the form to regenerate the cache.", formCode, version));
            }

            var compressedBytes = Convert.FromBase64String(base64Json);
            var jsonBytes = GzipCompressor.Decompress(compressedBytes);
            return Encoding.UTF8.GetString(jsonBytes);
        }

        private Entity FindCache(
            RenderCacheRepository cacheRepository,
            string formCode,
            int version,
            string languageCode,
            LocalPluginContext context)
        {
            var cacheEntity = cacheRepository.FindActiveCache(formCode, version, languageCode);
            if (cacheEntity != null) return cacheEntity;

            context.TracingService.Trace("Cache not found for language '{0}'. Trying default language '{1}'.",
                languageCode, DefaultLanguageCode);

            if (!string.Equals(languageCode, DefaultLanguageCode, StringComparison.OrdinalIgnoreCase))
                cacheEntity = cacheRepository.FindActiveCache(formCode, version, DefaultLanguageCode);

            if (cacheEntity != null) return cacheEntity;

            context.TracingService.Trace("No cache found for form '{0}' version {1} in any language.", formCode, version);
            throw new InvalidPluginExecutionException(string.Format(
                "No published form cache found for form code '{0}' version {1}. Please publish the form first.",
                formCode, version));
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

        private static string ReadStringParameter(LocalPluginContext context, string parameterName, string defaultValue)
        {
            if (!context.Context.InputParameters.Contains(parameterName)) return defaultValue;
            var value = context.Context.InputParameters[parameterName] as string;
            return string.IsNullOrWhiteSpace(value) ? defaultValue : value;
        }

        private static int ReadIntParameter(LocalPluginContext context, string parameterName)
        {
            if (!context.Context.InputParameters.Contains(parameterName)) return 0;
            var raw = context.Context.InputParameters[parameterName];
            if (raw is int) return (int)raw;
            int parsed;
            if (raw != null && int.TryParse(raw.ToString(), out parsed))
                return parsed;
            return 0;
        }
    }
}
