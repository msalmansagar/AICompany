using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.FormEngine.Core.Abstractions;

namespace Qdb.FormEngine.Data
{
    /// <summary>
    /// Manages qdb_publish_job records that track progress and outcome of form publish runs.
    /// Status codes: 1=Generating, 2=Completed, 3=Failed.
    /// </summary>
    public sealed class PublishJobRepository : IPublishJobRepository
    {
        private const int STATUS_GENERATING = 1;
        private const int STATUS_COMPLETED = 2;
        private const int STATUS_FAILED = 3;

        private readonly IOrganizationService _service;

        /// <summary>
        /// Initialises a new instance of <see cref="PublishJobRepository"/>.
        /// </summary>
        /// <param name="service">The CRM organisation service.</param>
        public PublishJobRepository(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException("service");
        }

        /// <summary>
        /// Creates a new publish job record in the Generating (1) status.
        /// </summary>
        /// <param name="formCode">The form code being published.</param>
        /// <param name="targetVersion">The version being targeted.</param>
        /// <param name="triggerReason">Human-readable reason for the publish.</param>
        /// <param name="languagesRequested">Comma-separated language codes.</param>
        /// <param name="formDefinitionId">GUID of the parent form definition.</param>
        /// <returns>GUID of the newly created publish job record.</returns>
        public Guid CreateJob(string formCode, int targetVersion, string triggerReason, string languagesRequested, Guid formDefinitionId)
        {
            var entity = new Entity("qdb_publish_job");
            entity["qdb_form_code"] = formCode;
            entity["qdb_target_version"] = targetVersion;
            entity["qdb_trigger_reason"] = triggerReason;
            entity["qdb_languages_requested"] = languagesRequested;
            entity["qdb_form_definition_id"] = new EntityReference("qdb_form_definition", formDefinitionId);
            entity["qdb_started_on"] = DateTime.UtcNow;
            entity["statuscode"] = new OptionSetValue(STATUS_GENERATING);
            return _service.Create(entity);
        }

        /// <summary>
        /// Appends the language code to the succeeded languages list on the job record.
        /// </summary>
        /// <param name="jobId">GUID of the publish job.</param>
        /// <param name="languageCode">Language that completed successfully.</param>
        public void MarkLanguageSucceeded(Guid jobId, string languageCode)
        {
            var existing = RetrieveLanguageFields(jobId);
            var current = existing.GetAttributeValue<string>("qdb_languages_succeeded") ?? string.Empty;
            var updated = AppendLanguageCode(current, languageCode);

            var update = new Entity("qdb_publish_job", jobId);
            update["qdb_languages_succeeded"] = updated;
            _service.Update(update);
        }

        /// <summary>
        /// Appends the language code to the failed languages list and records error detail.
        /// </summary>
        /// <param name="jobId">GUID of the publish job.</param>
        /// <param name="languageCode">Language that failed.</param>
        /// <param name="error">Error message or stack trace.</param>
        public void MarkLanguageFailed(Guid jobId, string languageCode, string error)
        {
            var existing = RetrieveLanguageFields(jobId);
            var current = existing.GetAttributeValue<string>("qdb_languages_failed") ?? string.Empty;
            var currentErrors = existing.GetAttributeValue<string>("qdb_error_details") ?? string.Empty;
            var updated = AppendLanguageCode(current, languageCode);
            var updatedErrors = AppendError(currentErrors, languageCode, error);

            var update = new Entity("qdb_publish_job", jobId);
            update["qdb_languages_failed"] = updated;
            update["qdb_error_details"] = updatedErrors;
            _service.Update(update);
        }

        /// <summary>
        /// Sets the publish job status to Completed (2).
        /// </summary>
        /// <param name="jobId">GUID of the publish job.</param>
        public void CompleteJob(Guid jobId)
        {
            var update = new Entity("qdb_publish_job", jobId);
            update["statuscode"] = new OptionSetValue(STATUS_COMPLETED);
            update["qdb_completed_on"] = DateTime.UtcNow;
            _service.Update(update);
        }

        /// <summary>
        /// Sets the publish job status to Failed (3) and records error details.
        /// </summary>
        /// <param name="jobId">GUID of the publish job.</param>
        /// <param name="errorDetails">Full error details for diagnostics.</param>
        public void FailJob(Guid jobId, string errorDetails)
        {
            var update = new Entity("qdb_publish_job", jobId);
            update["statuscode"] = new OptionSetValue(STATUS_FAILED);
            update["qdb_completed_on"] = DateTime.UtcNow;
            update["qdb_error_details"] = errorDetails;
            _service.Update(update);
        }

        private Entity RetrieveLanguageFields(Guid jobId)
        {
            return _service.Retrieve("qdb_publish_job", jobId,
                new ColumnSet("qdb_languages_succeeded", "qdb_languages_failed", "qdb_error_details"));
        }

        private static string AppendLanguageCode(string existing, string languageCode)
        {
            if (string.IsNullOrEmpty(existing)) return languageCode;
            return string.Concat(existing, ",", languageCode);
        }

        private static string AppendError(string existing, string languageCode, string error)
        {
            var entry = string.Format("[{0}] {1}", languageCode, error);
            if (string.IsNullOrEmpty(existing)) return entry;
            return string.Concat(existing, "\n", entry);
        }
    }
}
