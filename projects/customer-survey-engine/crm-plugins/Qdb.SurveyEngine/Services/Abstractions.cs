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

        /// <summary>Active Event/Created triggers of the source whose setup is also active.</summary>
        IReadOnlyList<SurveyTrigger> GetActiveEventTriggers(Guid sourceId);

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

    /// <summary>Writes invitations.</summary>
    public interface IInvitationRepository
    {
        bool ExistsWithDedupeKey(string dedupeKey);

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
        public IInvitationRepository Invitations { get; set; }
        public ISuppressionLog Suppressions { get; set; }
        public IClock Clock { get; set; }
        public ITrace Trace { get; set; }
    }
}
