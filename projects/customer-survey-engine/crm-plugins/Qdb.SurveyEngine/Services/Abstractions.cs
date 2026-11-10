using System;
using System.Collections.Generic;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Services
{
    /// <summary>Current time, injected so rules that depend on dates are testable.</summary>
    public interface IClock
    {
        DateTime UtcNow { get; }
    }

    /// <summary>Reads survey configuration (sources, triggers, settings).</summary>
    public interface ISurveyConfigRepository
    {
        /// <summary>The active source for a table, or null when the table is not an active source.</summary>
        SurveySource FindActiveSource(string tableLogicalName);

        /// <summary>Active Event, Created and Milestone triggers of the source whose setup is also active.</summary>
        IReadOnlyList<SurveyTrigger> GetActiveRecordTriggers(Guid sourceId);

        /// <summary>The org settings row; defaults when none exists.</summary>
        SurveySettings GetSettings();
    }

    /// <summary>Reads the current state of a source record.</summary>
    public interface ISourceRecordReader
    {
        /// <summary>Fills status, type, origin and customer from the record, keeping message and old status.</summary>
        RecordChange ReadCurrent(SurveySource source, RecordChange change);
    }

    /// <summary>Reads the customer's preferred language field.</summary>
    public interface ICustomerLanguageReader
    {
        /// <summary>The raw stored value of <paramref name="field"/> on the account, or null.</summary>
        object ReadLanguageValue(Guid customerId, string field);
    }

    /// <summary>Reads the DFE render cache.</summary>
    public interface IRenderCacheReader
    {
        /// <summary>The published version of the active cache row, or null when the form is not published in that language.</summary>
        int? FindActivePublishedVersion(string formCode, string languageCode);
    }

    /// <summary>Counts a customer's qualifying records for a milestone, live (FR-CSE-039).</summary>
    public interface IMilestoneCounter
    {
        int CountQualifying(MilestoneCountQuery query);
    }

    /// <summary>What to count: the source's records of one customer matching the milestone filters.</summary>
    public sealed class MilestoneCountQuery
    {
        public SurveySource Source { get; set; }
        public MilestoneSettings Settings { get; set; }
        public Guid CustomerId { get; set; }

        /// <summary>Only records created before this moment; null = no upper limit.</summary>
        public DateTime? CreatedBefore { get; set; }
    }

    /// <summary>Reads and writes invitations.</summary>
    public interface IInvitationRepository
    {
        bool ExistsWithDedupeKey(string dedupeKey);

        /// <summary>True when the customer has a sent invitation (Pending, Submitted or Expired) generated at or after <paramref name="sinceUtc"/>.</summary>
        bool HasSentInvitationSince(Guid customerId, DateTime sinceUtc);

        /// <summary>The highest milestone index already generated for the customer and setup; 0 when none.</summary>
        int GetLastMilestoneIndex(Guid setupId, Guid customerId);

        /// <summary>Creates the invitation; false when the dedupe alternate key already holds one (a concurrent duplicate).</summary>
        bool TryCreate(InvitationDraft draft);
    }

    /// <summary>Appends to the suppression log.</summary>
    public interface ISuppressionLog
    {
        void Write(SuppressionEntry entry);
    }

    /// <summary>Diagnostic trace output (the CRM tracing service in production).</summary>
    public interface ITrace
    {
        void Write(string message);
    }

    /// <summary>All collaborators of <see cref="SurveyTriggerService"/>, grouped to keep its constructor small.</summary>
    public sealed class SurveyTriggerDependencies
    {
        public ISurveyConfigRepository Config { get; set; }
        public ISourceRecordReader Records { get; set; }
        public ICustomerLanguageReader Languages { get; set; }
        public IRenderCacheReader RenderCache { get; set; }
        public IMilestoneCounter Milestones { get; set; }
        public IInvitationRepository Invitations { get; set; }
        public ISuppressionLog Suppressions { get; set; }
        public IClock Clock { get; set; }
        public ITrace Trace { get; set; }
    }
}
