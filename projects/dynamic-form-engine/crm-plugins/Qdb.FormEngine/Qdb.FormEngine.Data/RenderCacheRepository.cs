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

        // qdb_runtime_json is a Memo column at the platform maximum length. The base64 payload
        // is rejected before any write once it passes the warn ratio, so a too-large form fails
        // with a clear message instead of a cryptic truncation error mid-transaction.
        private const int RUNTIME_JSON_MAX_LENGTH = 1048576;
        private const double RUNTIME_JSON_WARN_RATIO = 0.9;

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

            var recordId = UpsertCacheRecord(request);

            SupersedePriorCaches(request.FormCode, request.Version, request.LanguageCode, recordId);

            return recordId;
        }

        /// <summary>
        /// Creates the cache record, or updates it in place when a record already exists
        /// for the same form/version/language. The alternate key
        /// (qdb_form_code, qdb_language_code, qdb_published_version) permits only one row
        /// per combination, so republishing the same version must overwrite rather than insert.
        /// </summary>
        /// <param name="request">All data required to persist the cache entry.</param>
        /// <returns>The GUID of the created or updated record.</returns>
        private Guid UpsertCacheRecord(RenderCacheWriteRequest request)
        {
            var record = BuildCacheEntity(request);
            var existingId = FindCacheRecordId(request.FormCode, request.Version, request.LanguageCode);
            if (!existingId.HasValue)
                return _service.Create(record);

            record.Id = existingId.Value;
            _service.Update(record);
            return existingId.Value;
        }

        private Guid? FindCacheRecordId(string formCode, int version, string languageCode)
        {
            var query = new QueryExpression("qdb_form_render_cache")
            {
                ColumnSet = new ColumnSet("qdb_form_render_cacheid"),
                TopCount = 1,
                NoLock = true
            };
            query.Criteria.AddCondition("qdb_form_code", ConditionOperator.Equal, formCode);
            query.Criteria.AddCondition("qdb_published_version", ConditionOperator.Equal, version);
            query.Criteria.AddCondition("qdb_language_code", ConditionOperator.Equal, languageCode);

            var results = _service.RetrieveMultiple(query);
            return results.Entities.Count > 0 ? (Guid?)results.Entities[0].Id : null;
        }

        /// <summary>
        /// Finds the active cache record for the given form/version/language combination.
        /// A non-positive <paramref name="version"/> resolves to the latest active version,
        /// matching the qdb_GetPublishedFormJson contract (Version 0 = latest active).
        /// Returns null when no active cache exists.
        /// </summary>
        /// <param name="formCode">The unique form code.</param>
        /// <param name="version">The form definition version, or 0 for the latest active.</param>
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
            if (version > 0)
                query.Criteria.AddCondition("qdb_published_version", ConditionOperator.Equal, version);
            query.Criteria.AddCondition("qdb_language_code", ConditionOperator.Equal, languageCode);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_status", ConditionOperator.Equal, STATUS_ACTIVE);
            query.AddOrder("qdb_published_version", OrderType.Descending);
            query.AddOrder("createdon", OrderType.Descending);

            var results = _service.RetrieveMultiple(query);
            return results.Entities.Count > 0 ? results.Entities[0] : null;
        }

        /// <summary>
        /// Marks active cache records of OTHER versions for the same form/language as superseded,
        /// leaving the just-published version as the single active cache. The same-version row is
        /// overwritten in place by <see cref="WriteCache"/>, so it is never superseded here.
        /// </summary>
        /// <param name="formCode">The unique form code.</param>
        /// <param name="version">The version just published, which must stay active.</param>
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
            query.Criteria.AddCondition("qdb_published_version", ConditionOperator.NotEqual, version);
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
            update["qdb_status"] = new OptionSetValue(STATUS_SUPERSEDED);
            update["qdb_is_active"] = false;
            _service.Update(update);
        }

        private Entity BuildCacheEntity(RenderCacheWriteRequest request)
        {
            var entity = new Entity("qdb_form_render_cache");
            entity["qdb_form_code"] = request.FormCode;
            entity["qdb_published_version"] = request.Version;
            entity["qdb_language_code"] = request.LanguageCode;
            entity["qdb_lcid"] = request.Lcid;
            // Store gzip bytes as a Base64 string in the Memo column. Compatible with on-premise
            // 9.x where File columns are unreliable. The Memo cap (1,048,576 chars) holds roughly
            // 4-5 MB of raw JSON after gzip+base64; the guard below rejects anything larger before
            // the write so it fails with a clear message rather than a truncation error.
            var runtimeJson = Convert.ToBase64String(request.JsonBytes);
            GuardRuntimeJsonSize(runtimeJson, request);
            entity["qdb_runtime_json"] = runtimeJson;
            entity["qdb_json_hash"] = request.JsonHash;
            entity["qdb_json_size_bytes"] = request.JsonSizeBytes;
            entity["qdb_is_compressed"] = true;
            entity["qdb_generator_version"] = request.GeneratorVersion;
            entity["qdb_generation_duration_ms"] = request.GenerationDurationMs;
            entity["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", request.FormDefinitionId);
            entity["qdb_publish_job_id"] = new EntityReference("qdb_publish_job", request.PublishJobId);
            entity["qdb_status"] = new OptionSetValue(STATUS_ACTIVE);
            entity["qdb_is_active"] = true;
            if (request.PublishedBy.HasValue)
                entity["qdb_published_by"] = new EntityReference("systemuser", request.PublishedBy.Value);
            return entity;
        }

        /// <summary>
        /// Rejects a render-cache payload that would not fit (or nearly not fit) the
        /// qdb_runtime_json Memo column, so an oversized form fails with an actionable message
        /// before any write rather than a cryptic platform truncation error.
        /// </summary>
        /// <param name="runtimeJson">The Base64(gzip(json)) payload about to be stored.</param>
        /// <param name="request">The originating write request, for diagnostics.</param>
        private static void GuardRuntimeJsonSize(string runtimeJson, RenderCacheWriteRequest request)
        {
            var threshold = (int)(RUNTIME_JSON_MAX_LENGTH * RUNTIME_JSON_WARN_RATIO);
            if (runtimeJson.Length <= threshold) return;

            throw new InvalidOperationException(string.Format(
                "Render cache for form '{0}' language '{1}' is {2} characters, exceeding the safe " +
                "limit of {3} ({4:P0} of the {5}-character qdb_runtime_json Memo column). The form " +
                "is too large to store in a single cell — enable chunking across rows or move the " +
                "payload to a note/file attachment.",
                request.FormCode, request.LanguageCode, runtimeJson.Length, threshold,
                RUNTIME_JSON_WARN_RATIO, RUNTIME_JSON_MAX_LENGTH));
        }
    }
}
