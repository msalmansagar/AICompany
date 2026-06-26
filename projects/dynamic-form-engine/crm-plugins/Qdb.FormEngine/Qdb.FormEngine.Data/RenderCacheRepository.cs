using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.FormEngine.Core.Abstractions;

namespace Qdb.FormEngine.Data
{
    /// <summary>
    /// Persists and retrieves rendered form JSON cache entries in qdb_form_render_cache.
    /// The runtime JSON is stored as Base64(gzip(json)) in the Memo column qdb_runtime_json —
    /// compatible with both Dataverse cloud and CRM on-premise 9.1 (File columns are not
    /// reliable on on-prem). Status codes: 1=Generating, 2=Active, 3=Superseded, 4=Failed.
    /// </summary>
    public sealed class RenderCacheRepository : IRenderCacheRepository
    {
        private const int STATUS_ACTIVE = 2;
        private const int STATUS_SUPERSEDED = 3;

        private readonly IOrganizationService _service;

        /// <summary>
        /// Initialises a new instance of <see cref="RenderCacheRepository"/>.
        /// </summary>
        /// <param name="service">The CRM organisation service.</param>
        public RenderCacheRepository(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException("service");
        }

        /// <summary>
        /// Creates a cache record and stores the compressed JSON as a Base64 string in the
        /// Memo column qdb_runtime_json. Supersedes all prior active records for the same
        /// form/version/language in the same operation.
        /// </summary>
        /// <param name="request">All data required to persist the cache entry.</param>
        /// <returns>The GUID of the newly created record.</returns>
        public Guid WriteCache(RenderCacheWriteRequest request)
        {
            if (request == null) throw new ArgumentNullException("request");

            var record = BuildCacheEntity(request);
            var recordId = _service.Create(record);

            SupersedePriorCaches(request.FormCode, request.Version, request.LanguageCode, recordId);

            return recordId;
        }

        /// <summary>
        /// Finds the active cache record for the given form/version/language combination.
        /// Returns null when no active cache exists.
        /// </summary>
        /// <param name="formCode">The unique form code.</param>
        /// <param name="version">The form definition version.</param>
        /// <param name="languageCode">Two-letter language code.</param>
        /// <returns>Matching entity or null.</returns>
        public Entity FindActiveCache(string formCode, int version, string languageCode)
        {
            var query = new QueryExpression("qdb_form_render_cache")
            {
                ColumnSet = new ColumnSet(true),
                TopCount = 1,
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_form_code", ConditionOperator.Equal, formCode);
            query.Criteria.AddCondition("qdb_version", ConditionOperator.Equal, version);
            query.Criteria.AddCondition("qdb_language_code", ConditionOperator.Equal, languageCode);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("statuscode", ConditionOperator.Equal, STATUS_ACTIVE);
            query.AddOrder("createdon", OrderType.Descending);

            var results = _service.RetrieveMultiple(query);
            return results.Entities.Count > 0 ? results.Entities[0] : null;
        }

        /// <summary>
        /// Marks all active cache records for the given form/version/language as superseded,
        /// except for the newly written record.
        /// </summary>
        /// <param name="formCode">The unique form code.</param>
        /// <param name="version">The form definition version.</param>
        /// <param name="languageCode">Two-letter language code.</param>
        /// <param name="exceptId">The newly written cache record to exclude.</param>
        public void SupersedePriorCaches(string formCode, int version, string languageCode, Guid exceptId)
        {
            var query = new QueryExpression("qdb_form_render_cache")
            {
                ColumnSet = new ColumnSet("qdb_form_render_cacheid"),
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_form_code", ConditionOperator.Equal, formCode);
            query.Criteria.AddCondition("qdb_version", ConditionOperator.Equal, version);
            query.Criteria.AddCondition("qdb_language_code", ConditionOperator.Equal, languageCode);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_form_render_cacheid", ConditionOperator.NotEqual, exceptId);

            var results = _service.RetrieveMultiple(query);
            foreach (var entity in results.Entities)
                SupersedeRecord(entity.Id);
        }

        private void SupersedeRecord(Guid recordId)
        {
            var update = new Entity("qdb_form_render_cache", recordId);
            update["statuscode"] = new OptionSetValue(STATUS_SUPERSEDED);
            update["qdb_is_active"] = false;
            _service.Update(update);
        }

        private Entity BuildCacheEntity(RenderCacheWriteRequest request)
        {
            var entity = new Entity("qdb_form_render_cache");
            entity["qdb_form_code"] = request.FormCode;
            entity["qdb_version"] = request.Version;
            entity["qdb_language_code"] = request.LanguageCode;
            entity["qdb_lcid"] = request.Lcid;
            // Store gzip bytes as a Base64 string in the Memo column.
            // This is compatible with on-premise 9.1 where File columns are unreliable.
            // Practical cap: ~1 MB of uncompressed JSON before the Memo column limit is reached.
            entity["qdb_runtime_json"] = Convert.ToBase64String(request.JsonBytes);
            entity["qdb_json_hash"] = request.JsonHash;
            entity["qdb_json_size_bytes"] = request.JsonSizeBytes;
            entity["qdb_is_compressed"] = true;
            entity["qdb_generator_version"] = request.GeneratorVersion;
            entity["qdb_generation_duration_ms"] = request.GenerationDurationMs;
            entity["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", request.FormDefinitionId);
            entity["qdb_publish_job_id"] = new EntityReference("qdb_publish_job", request.PublishJobId);
            entity["statuscode"] = new OptionSetValue(STATUS_ACTIVE);
            entity["qdb_is_active"] = true;
            if (request.PublishedBy.HasValue)
                entity["qdb_published_by"] = new EntityReference("systemuser", request.PublishedBy.Value);
            return entity;
        }
    }
}
