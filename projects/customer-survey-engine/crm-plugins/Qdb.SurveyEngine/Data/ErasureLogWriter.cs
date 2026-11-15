using System;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Erasure;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Writes one append-only row to qdb_survey_erasure_log per erasure execution (OQ-C1 Option B,
    /// NFR-CSE-013). The table ships in the same solution as this plugin, so a failed write is a real
    /// fault: it propagates, and the caller learns the erasure has no recorded evidence.
    /// </summary>
    public sealed class ErasureLogWriter : IErasureTraceWriter
    {
        /// <summary>Logical name of the durable DSAR audit table.</summary>
        public const string ErasureLogTable = "qdb_survey_erasure_log";

        private readonly IOrganizationService _service;

        /// <summary>Creates a writer that records erasures through the given service.</summary>
        public ErasureLogWriter(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public void Write(ErasureRecord record)
        {
            if (record == null) throw new ArgumentNullException(nameof(record));
            _service.Create(ToEntity(record));
        }

        // Column names must match provisioning/manifest.mjs; provisioning/__tests__ reads this file to check.
        // The caller and customer are kept as text so the evidence outlives the user and customer records.
        private static Entity ToEntity(ErasureRecord record) => new Entity(ErasureLogTable)
        {
            ["qdb_name"] = $"DSAR {record.ExecutedOnUtc:yyyy-MM-dd HH:mm:ss} UTC",
            ["qdb_caller_id"] = record.InitiatingUserId.ToString("D"),
            ["qdb_customer_guid"] = record.CustomerId.ToString("D"),
            ["qdb_mode"] = record.Mode == ErasureMode.Delete ? 100000000 : 100000001,
            ["qdb_dry_run"] = record.DryRun,
            ["qdb_invitation_count"] = record.InvitationCount,
            ["qdb_response_count"] = record.ResponseCount,
            ["qdb_answer_count"] = record.AnswerCount,
            ["qdb_suppression_log_count"] = record.SuppressionLogCount,
            ["qdb_are_actual"] = record.AreActual,
            ["qdb_is_complete"] = record.IsComplete,
            ["qdb_logged_on"] = record.ExecutedOnUtc,
        };
    }
}
