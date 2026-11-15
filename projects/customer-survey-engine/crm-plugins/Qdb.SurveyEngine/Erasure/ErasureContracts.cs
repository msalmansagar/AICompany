using System;
using System.Collections.Generic;

namespace Qdb.SurveyEngine.Erasure
{
    /// <summary>
    /// How to process a customer's survey data for a DSAR right-to-erasure request (FR-CSE-081).
    /// Integer values match the Custom API Mode parameter contract (ADR-008: no new option set).
    /// </summary>
    public enum ErasureMode
    {
        /// <summary>Delete invitations (cascade removes responses and answers), then delete suppression logs.</summary>
        Delete = 100000000,

        /// <summary>Anonymise responses first (severing the cascade), then delete invitations and suppression logs.</summary>
        Anonymise = 100000001,
    }

    /// <summary>Inputs to one erasure execution.</summary>
    public sealed class ErasureRequest
    {
        /// <summary>The account or contact id whose data is being erased.</summary>
        public Guid CustomerId { get; set; }

        /// <summary>The CRM user who called the API; written to the durable audit log.</summary>
        public Guid InitiatingUserId { get; set; }

        public ErasureMode Mode { get; set; }

        /// <summary>When true, finds but does not mutate; always returns IsComplete = true.</summary>
        public bool DryRun { get; set; }
    }

    /// <summary>What was found (dry-run) or erased (live) in one call of the erasure API.</summary>
    public sealed class ErasureCounts
    {
        public int InvitationCount { get; set; }
        public int ResponseCount { get; set; }
        public int AnswerCount { get; set; }
        public int SuppressionLogCount { get; set; }

        /// <summary>False in dry-run; true in a live execution.</summary>
        public bool AreActual { get; set; }

        /// <summary>False when the time budget ran out before all rows were processed; re-invoke until true.</summary>
        public bool IsComplete { get; set; } = true;
    }

    /// <summary>One row written to the durable erasure audit log (OQ-C1 Option B).</summary>
    public sealed class ErasureRecord
    {
        public Guid InitiatingUserId { get; set; }
        public Guid CustomerId { get; set; }
        public ErasureMode Mode { get; set; }
        public bool DryRun { get; set; }
        public int InvitationCount { get; set; }
        public int ResponseCount { get; set; }
        public int AnswerCount { get; set; }
        public int SuppressionLogCount { get; set; }
        public bool AreActual { get; set; }
        public bool IsComplete { get; set; }
        public DateTime ExecutedOnUtc { get; set; }
    }

    /// <summary>Answers whether a user may call qdb_srv_EraseCustomerSurveyData (FR-CSE-082).</summary>
    public interface IErasureAccessCheck
    {
        /// <summary>True when the user is a System Administrator or holds the Survey Data Officer role, directly or through a team.</summary>
        bool MayErase(Guid userId);
    }

    /// <summary>Per-table find and delete operations scoped to one customer (C.3.3).</summary>
    public interface ICustomerSurveyDataRepository
    {
        /// <summary>All invitations whose customer lookup matches customerId, ordered by id.</summary>
        IReadOnlyList<Guid> FindInvitations(Guid customerId);

        /// <summary>All responses whose customer lookup matches customerId, ordered by id.</summary>
        IReadOnlyList<Guid> FindResponses(Guid customerId);

        /// <summary>
        /// Responses whose customer lookup matches customerId AND whose invitation link is null.
        /// Used in delete mode as a defensive step after invitation cascade (C.3.4).
        /// </summary>
        IReadOnlyList<Guid> FindResidualResponses(Guid customerId);

        /// <summary>All answers whose parent response is in responseIds.</summary>
        IReadOnlyList<Guid> FindAnswers(IReadOnlyList<Guid> responseIds);

        /// <summary>All suppression logs whose customer lookup matches customerId, ordered by id.</summary>
        IReadOnlyList<Guid> FindSuppressionLogs(Guid customerId);

        void DeleteInvitation(Guid id);
        void DeleteResponse(Guid id);
        void DeleteSuppressionLog(Guid id);
    }

    /// <summary>
    /// Writes one row to the durable DSAR audit log (qdb_survey_erasure_log). Implementations must
    /// be a no-op when the table does not yet exist in the org (PAT-003 / OQ-C1).
    /// </summary>
    public interface IErasureTraceWriter
    {
        void Write(ErasureRecord record);
    }
}
