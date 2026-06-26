using System;

namespace Qdb.FormEngine.Core.Abstractions
{
    /// <summary>
    /// Manages qdb_publish_job records that track the progress and outcome
    /// of form publishing runs across one or more language variants.
    /// </summary>
    public interface IPublishJobRepository
    {
        /// <summary>
        /// Creates a new publish job record in the Generating (1) status.
        /// </summary>
        /// <param name="formCode">The unique form code being published.</param>
        /// <param name="targetVersion">The form definition version being targeted.</param>
        /// <param name="triggerReason">Human-readable reason for the publish (e.g. "ManualPublish", "TranslationUpdate").</param>
        /// <param name="languagesRequested">Comma-separated list of language codes requested.</param>
        /// <param name="formDefinitionId">GUID of the parent qdb_form_definition record.</param>
        /// <returns>The GUID of the newly created publish job record.</returns>
        Guid CreateJob(string formCode, int targetVersion, string triggerReason, string languagesRequested, Guid formDefinitionId);

        /// <summary>
        /// Appends the language code to the succeeded languages list on the job record.
        /// </summary>
        /// <param name="jobId">GUID of the publish job record.</param>
        /// <param name="languageCode">The language code that completed successfully.</param>
        void MarkLanguageSucceeded(Guid jobId, string languageCode);

        /// <summary>
        /// Appends the language code to the failed languages list on the job record
        /// and records the error detail.
        /// </summary>
        /// <param name="jobId">GUID of the publish job record.</param>
        /// <param name="languageCode">The language code that failed.</param>
        /// <param name="error">The error message or stack trace summary.</param>
        void MarkLanguageFailed(Guid jobId, string languageCode, string error);

        /// <summary>
        /// Sets the publish job status to Completed (2) and records the completion timestamp.
        /// </summary>
        /// <param name="jobId">GUID of the publish job record.</param>
        void CompleteJob(Guid jobId);

        /// <summary>
        /// Sets the publish job status to Failed (3) and records the error details.
        /// </summary>
        /// <param name="jobId">GUID of the publish job record.</param>
        /// <param name="errorDetails">Full error details for diagnostics.</param>
        void FailJob(Guid jobId, string errorDetails);
    }
}
