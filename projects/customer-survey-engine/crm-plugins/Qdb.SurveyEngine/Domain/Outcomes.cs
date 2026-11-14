using System;

namespace Qdb.SurveyEngine.Domain
{
    /// <summary>An invitation ready to be written (section 4.4).</summary>
    public sealed class InvitationDraft
    {
        public string Name { get; set; }
        public Guid CustomerId { get; set; }
        public Guid SetupId { get; set; }
        public Guid TriggerId { get; set; }
        public string SourceTable { get; set; }
        public Guid? SourceRecordId { get; set; }
        public string FormCode { get; set; }
        public int PinnedVersion { get; set; }
        public string LanguageCode { get; set; }
        public InvitationStatus Status { get; set; } = InvitationStatus.Pending;
        public InvitationChannel Channel { get; set; }
        public DateTime GeneratedOn { get; set; }
        public DateTime? ExpiresOn { get; set; }
        public string DedupeKey { get; set; }

        /// <summary>The milestone index this invitation fulfils; null for event and created triggers.</summary>
        public int? MilestoneIndex { get; set; }

        /// <summary>The calendar period of a scheduled invitation, e.g. 2026-Q1; null otherwise.</summary>
        public string SchedulePeriodKey { get; set; }
    }

    /// <summary>One row of the append-only suppression log (NFR-CSE-001).</summary>
    public sealed class SuppressionEntry
    {
        public SuppressionReason Reason { get; set; }
        public Guid? CustomerId { get; set; }
        public Guid TriggerId { get; set; }
        public Guid SetupId { get; set; }
        public string SourceTable { get; set; }
        public Guid? SourceRecordId { get; set; }
        public string Detail { get; set; }
        public DateTime LoggedOn { get; set; }
    }
}
