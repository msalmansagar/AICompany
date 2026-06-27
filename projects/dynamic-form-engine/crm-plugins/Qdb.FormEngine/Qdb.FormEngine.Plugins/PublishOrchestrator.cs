using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Qdb.FormEngine.Core.Abstractions;
using Qdb.FormEngine.Core.Generation;
using Qdb.FormEngine.Core.Hashing;
using Qdb.FormEngine.Core.Serialization;

namespace Qdb.FormEngine.Plugins
{
    /// <summary>
    /// Orchestrates the full form publish pipeline for one or more language variants.
    /// Shared by <see cref="PublishFormPlugin"/> and <c>PublishFormActivity</c> to ensure
    /// identical behaviour from both the async plugin and the on-premise workflow activity.
    /// </summary>
    public sealed class PublishOrchestrator
    {
        private readonly IMetadataReader _metadataReader;
        private readonly IPublishJobRepository _publishJobRepository;
        private readonly IRenderCacheRepository _renderCacheRepository;
        private readonly IFormJsonGenerator _formJsonGenerator;
        private readonly ISecurityStripper _securityStripper;
        private readonly IJsonSerializer _jsonSerializer;
        private readonly ITracingService _tracingService;
        private readonly string _generatorVersion;

        /// <summary>
        /// Initialises a new instance of <see cref="PublishOrchestrator"/> with all dependencies.
        /// </summary>
        public PublishOrchestrator(
            IMetadataReader metadataReader,
            IPublishJobRepository publishJobRepository,
            IRenderCacheRepository renderCacheRepository,
            IFormJsonGenerator formJsonGenerator,
            ISecurityStripper securityStripper,
            IJsonSerializer jsonSerializer,
            ITracingService tracingService,
            string generatorVersion)
        {
            _metadataReader = metadataReader ?? throw new ArgumentNullException("metadataReader");
            _publishJobRepository = publishJobRepository ?? throw new ArgumentNullException("publishJobRepository");
            _renderCacheRepository = renderCacheRepository ?? throw new ArgumentNullException("renderCacheRepository");
            _formJsonGenerator = formJsonGenerator ?? throw new ArgumentNullException("formJsonGenerator");
            _securityStripper = securityStripper ?? throw new ArgumentNullException("securityStripper");
            _jsonSerializer = jsonSerializer ?? throw new ArgumentNullException("jsonSerializer");
            _tracingService = tracingService ?? throw new ArgumentNullException("tracingService");
            _generatorVersion = generatorVersion ?? "1.0.0";
        }

        /// <summary>
        /// Runs the publish pipeline for every active language, tracking success and failure
        /// per language on the publish job record. Throws <see cref="InvalidPluginExecutionException"/>
        /// only when ALL languages fail.
        /// </summary>
        /// <param name="formCode">The form code to publish.</param>
        /// <param name="targetVersion">The form definition version to generate.</param>
        /// <param name="publishJobId">GUID of the pre-created qdb_publish_job record.</param>
        public void Publish(string formCode, int targetVersion, Guid publishJobId)
        {
            _tracingService.Trace("PublishOrchestrator: reading metadata for form code '{0}'", formCode);
            var rawData = _metadataReader.ReadFormRawData(formCode);

            var languages = rawData.Languages ?? new List<Microsoft.Xrm.Sdk.Entity>();
            if (languages.Count == 0)
            {
                _tracingService.Trace("No active languages found; defaulting to 'en'.");
                languages = BuildDefaultLanguageList();
            }

            var effectiveVersion = targetVersion > 0
                ? targetVersion
                : rawData.FormEntity.GetAttributeValue<int>("qdb_version");
            if (effectiveVersion <= 0) effectiveVersion = 1;

            publishJobId = EnsurePublishJob(publishJobId, formCode, effectiveVersion, languages, rawData.FormEntity.Id);

            var successCount = 0;
            var failureCount = 0;

            foreach (var language in languages)
            {
                var languageCode = language.GetAttributeValue<string>("qdb_language_code") ?? "en";
                var lcid = language.Contains("qdb_lcid") ? language.GetAttributeValue<int>("qdb_lcid") : 1033;

                try
                {
                    PublishLanguage(rawData, formCode, effectiveVersion, publishJobId, languageCode, lcid);
                    _publishJobRepository.MarkLanguageSucceeded(publishJobId, languageCode);
                    successCount++;
                    _tracingService.Trace("Language '{0}' published successfully.", languageCode);
                }
                catch (Exception ex)
                {
                    _tracingService.Trace("Language '{0}' failed: {1}", languageCode, ex.Message);
                    _publishJobRepository.MarkLanguageFailed(publishJobId, languageCode, ex.Message);
                    failureCount++;
                }
            }

            if (successCount > 0 && failureCount == 0)
            {
                _publishJobRepository.CompleteJob(publishJobId);
            }
            else if (successCount > 0)
            {
                _publishJobRepository.PartiallyCompleteJob(publishJobId);
                _tracingService.Trace("Publish partially completed: {0} succeeded, {1} failed.", successCount, failureCount);
            }
            else
            {
                var errorSummary = string.Format("All {0} languages failed to publish for form '{1}'.", failureCount, formCode);
                _publishJobRepository.FailJob(publishJobId, errorSummary);
                _tracingService.Trace(errorSummary);
                throw new InvalidPluginExecutionException(errorSummary);
            }
        }

        /// <summary>
        /// Returns the supplied publish job id, or creates a new publish job when none was
        /// provided (e.g. when invoked from a command button with only a form code).
        /// </summary>
        private Guid EnsurePublishJob(Guid publishJobId, string formCode, int version, List<Microsoft.Xrm.Sdk.Entity> languages, Guid formDefinitionId)
        {
            if (publishJobId != Guid.Empty) return publishJobId;

            var requestedLanguages = string.Join(",", languages
                .Select(language => language.GetAttributeValue<string>("qdb_language_code"))
                .Where(code => !string.IsNullOrEmpty(code)));
            var createdJobId = _publishJobRepository.CreateJob(formCode, version, "CommandButton", requestedLanguages, formDefinitionId);
            _tracingService.Trace("Auto-created publish job {0} for form '{1}'.", createdJobId, formCode);
            return createdJobId;
        }

        private void PublishLanguage(FormRawData rawData, string formCode, int targetVersion, Guid publishJobId, string languageCode, int lcid)
        {
            _tracingService.Trace("Building translation map for language '{0}'", languageCode);
            var allRecordIds = CollectAllRecordIds(rawData);
            rawData.TranslationMap = _metadataReader.ReadTranslationMap(allRecordIds, languageCode);

            _tracingService.Trace("Generating form model for language '{0}'", languageCode);
            var startMs = Environment.TickCount;
            var model = _formJsonGenerator.Generate(rawData, languageCode);
            var stripped = _securityStripper.Strip(model);
            var json = _jsonSerializer.Serialize(stripped);
            var jsonBytes = Encoding.UTF8.GetBytes(json);
            var compressedBytes = GzipCompressor.Compress(jsonBytes);
            var hash = HashService.ComputeSha256Hex(compressedBytes);
            var durationMs = Environment.TickCount - startMs;

            var writeRequest = new RenderCacheWriteRequest
            {
                FormCode = formCode,
                Version = targetVersion,
                LanguageCode = languageCode,
                Lcid = lcid,
                JsonBytes = compressedBytes,
                JsonHash = hash,
                JsonSizeBytes = compressedBytes.Length,
                GeneratorVersion = _generatorVersion,
                GenerationDurationMs = durationMs,
                FormDefinitionId = rawData.FormEntity.Id,
                PublishJobId = publishJobId
            };

            _tracingService.Trace("Writing cache for language '{0}', size={1} bytes, hash={2}", languageCode, compressedBytes.Length, hash);
            _renderCacheRepository.WriteCache(writeRequest);
        }

        private static List<Guid> CollectAllRecordIds(FormRawData rawData)
        {
            var ids = new List<Guid>();
            if (rawData.FormEntity != null) ids.Add(rawData.FormEntity.Id);
            AddIds(ids, rawData.Tabs);
            AddIds(ids, rawData.Sections);
            AddIds(ids, rawData.Fields);
            AddIds(ids, rawData.OptionValues);
            AddIds(ids, rawData.ValidationRules);
            AddIds(ids, rawData.GridColumnConfigs);
            AddIds(ids, rawData.Buttons);
            AddIds(ids, rawData.InfoCardScreens);
            AddIds(ids, rawData.InfoCardSections);
            AddIds(ids, rawData.InfoCardItems);
            return ids;
        }

        private static void AddIds(List<Guid> ids, List<Microsoft.Xrm.Sdk.Entity> entities)
        {
            if (entities == null) return;
            foreach (var e in entities)
                if (e.Id != Guid.Empty)
                    ids.Add(e.Id);
        }

        private static List<Microsoft.Xrm.Sdk.Entity> BuildDefaultLanguageList()
        {
            var defaultLanguage = new Microsoft.Xrm.Sdk.Entity("qdb_language_config");
            defaultLanguage["qdb_language_code"] = "en";
            defaultLanguage["qdb_lcid"] = 1033;
            return new List<Microsoft.Xrm.Sdk.Entity> { defaultLanguage };
        }
    }
}
