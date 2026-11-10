using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>In-memory stand-ins for the CRM-backed repositories, so the service runs for real in tests.</summary>
    public sealed class InMemorySurveyStore : ISurveyConfigRepository, ISourceRecordReader, ICustomerLanguageReader,
        IRenderCacheReader, IInvitationRepository, ISuppressionLog, IClock, ITrace
    {
        public SurveySource ActiveSource { get; set; }
        public List<SurveyTrigger> Triggers { get; } = new List<SurveyTrigger>();
        public SurveySettings Settings { get; set; } = new SurveySettings();
        public RecordChange CurrentRecord { get; set; }
        public Dictionary<string, int> PublishedVersions { get; } = new Dictionary<string, int>();
        public object CustomerLanguage { get; set; }
        public List<InvitationDraft> Invitations { get; } = new List<InvitationDraft>();
        public List<SuppressionEntry> Suppressions { get; } = new List<SuppressionEntry>();
        public List<string> TraceLines { get; } = new List<string>();
        public bool SimulateConcurrentDuplicate { get; set; }
        public DateTime UtcNow { get; set; } = new DateTime(2026, 11, 10, 9, 0, 0, DateTimeKind.Utc);

        public SurveySource FindActiveSource(string tableLogicalName) =>
            ActiveSource != null && ActiveSource.TableLogicalName == tableLogicalName ? ActiveSource : null;

        public IReadOnlyList<SurveyTrigger> GetActiveEventTriggers(Guid sourceId) => Triggers;

        public SurveySettings GetSettings() => Settings;

        public RecordChange ReadCurrent(SurveySource source, RecordChange change)
        {
            CurrentRecord.Message = change.Message;
            CurrentRecord.TableLogicalName = change.TableLogicalName;
            CurrentRecord.RecordId = change.RecordId;
            return CurrentRecord;
        }

        public object ReadLanguageValue(Guid customerId, string field) => CustomerLanguage;

        public int? FindActivePublishedVersion(string formCode, string languageCode)
        {
            int version;
            return PublishedVersions.TryGetValue(formCode + "|" + languageCode, out version) ? version : (int?)null;
        }

        public bool ExistsWithDedupeKey(string dedupeKey) => Invitations.Any(i => i.DedupeKey == dedupeKey);

        public bool TryCreate(InvitationDraft draft)
        {
            if (SimulateConcurrentDuplicate || ExistsWithDedupeKey(draft.DedupeKey)) return false;
            Invitations.Add(draft);
            return true;
        }

        public void Write(SuppressionEntry entry) => Suppressions.Add(entry);

        void ITrace.Write(string message) => TraceLines.Add(message);

        public SurveyTriggerDependencies AsDependencies() => new SurveyTriggerDependencies
        {
            Config = this, Records = this, Languages = this, RenderCache = this,
            Invitations = this, Suppressions = this, Clock = this, Trace = this,
        };
    }
}
