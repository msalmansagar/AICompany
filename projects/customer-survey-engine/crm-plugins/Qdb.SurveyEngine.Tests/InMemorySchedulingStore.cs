using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>In-memory scheduling collaborators over an <see cref="InMemorySurveyStore"/>, so the daily job runs for real.</summary>
    public sealed class InMemorySchedulingStore : IScheduledTriggerRepository, ICustomerPopulationReader, IScheduledInvitationReader, IScheduledRunStore, IPostponedInvitationStore, IResponseRetentionStore, IInvitationRetentionStore, ISuppressionLogRetentionStore
    {
        private const string FirstRowVersion = "0";
        private int _lastRowVersion;

        /// <summary>Trigger id → its stored run record (qdb_survey_trigger run columns), with the row version.</summary>
        public Dictionary<Guid, ScheduledRunState> Runs { get; } = new Dictionary<Guid, ScheduledRunState>();

        /// <summary>When set, the trigger's row changes just after it is read, as an overlapping scheduler call would.</summary>
        public Guid? ChangedAfterRead { get; set; }

        /// <summary>Population pages read so far.</summary>
        public int PagesRead { get; private set; }

        private string RowVersionOf(Guid triggerId) => Runs.TryGetValue(triggerId, out var run) ? run.RowVersion : FirstRowVersion;

        public RunWrite TrySave(Guid triggerId, ScheduledRunState state)
        {
            if (state.RowVersion != RowVersionOf(triggerId)) return RunWrite.Lost();
            var saved = state.Copy();
            saved.RowVersion = (++_lastRowVersion).ToString(System.Globalization.CultureInfo.InvariantCulture);
            Runs[triggerId] = saved;
            return RunWrite.Saved(saved.RowVersion);
        }

        private void Touch(Guid triggerId)
        {
            var run = Runs.TryGetValue(triggerId, out var stored) ? stored.Copy() : new ScheduledRunState();
            run.RowVersion = (++_lastRowVersion).ToString(System.Globalization.CultureInfo.InvariantCulture);
            Runs[triggerId] = run;
        }
        private readonly InMemorySurveyStore _pipeline;

        public InMemorySchedulingStore(InMemorySurveyStore pipeline)
        {
            _pipeline = pipeline;
            OneTime = new InMemoryOneTimeStore(pipeline);
        }

        /// <summary>Addendum D collaborators: One-time triggers, audience and the daily gate.</summary>
        public InMemoryOneTimeStore OneTime { get; }

        public List<SurveyTrigger> ScheduledTriggers { get; } = new List<SurveyTrigger>();
        public List<Guid> ActiveCustomers { get; } = new List<Guid>();
        public List<Guid> CustomersActiveInPeriod { get; } = new List<Guid>();
        public PopulationQuery LastPopulationQuery { get; private set; }
        public List<PostponedInvitation> Postponed { get; } = new List<PostponedInvitation>();
        public List<Guid> Released { get; } = new List<Guid>();
        public List<Guid> Discarded { get; } = new List<Guid>();
        public HashSet<Guid> ChangedElsewhere { get; } = new HashSet<Guid>();

        /// <summary>Response id → submitted on and whether it still names the customer.</summary>
        public Dictionary<Guid, Tuple<DateTime, bool>> Responses { get; } = new Dictionary<Guid, Tuple<DateTime, bool>>();
        public List<Guid> Deleted { get; } = new List<Guid>();
        public List<Guid> Anonymised { get; } = new List<Guid>();

        /// <summary>Invitation id → generated-on date; populated by retention extension tests.</summary>
        public Dictionary<Guid, DateTime> InvitationGeneratedOn { get; } = new Dictionary<Guid, DateTime>();

        /// <summary>Suppression log id → created-on date; populated by retention extension tests.</summary>
        public Dictionary<Guid, DateTime> SuppressionLogCreatedOn { get; } = new Dictionary<Guid, DateTime>();

        public List<Guid> DeletedInvitations { get; } = new List<Guid>();
        public List<Guid> DeletedSuppressionLogs { get; } = new List<Guid>();

        // Each read carries the stored run record, as the CRM repository reads the run columns with the trigger.
        public IReadOnlyList<SurveyTrigger> GetActiveScheduledTriggers()
        {
            foreach (var trigger in ScheduledTriggers)
                trigger.Schedule.Run = Runs.TryGetValue(trigger.Id, out var run) ? run.Copy() : new ScheduledRunState { RowVersion = FirstRowVersion };
            if (ChangedAfterRead.HasValue) Touch(ChangedAfterRead.Value);
            return ScheduledTriggers;
        }

        public CustomerPage ReadActiveCustomers(Guid? afterCustomerId, int pageSize) => PageOf(ActiveCustomers, afterCustomerId, pageSize);

        public CustomerPage ReadCustomersActiveIn(PopulationQuery query, Guid? afterCustomerId, int pageSize)
        {
            LastPopulationQuery = query;
            return PageOf(CustomersActiveInPeriod, afterCustomerId, pageSize);
        }

        // Ordered by id and resumed after the last id read, as the CRM readers do.
        private CustomerPage PageOf(IEnumerable<Guid> population, Guid? afterCustomerId, int pageSize)
        {
            PagesRead++;
            var page = population.OrderBy(id => id).Where(id => !afterCustomerId.HasValue || id.CompareTo(afterCustomerId.Value) > 0).Take(pageSize).ToList();
            return new CustomerPage { CustomerIds = page, LastReadId = page.Count > 0 ? page.Last() : afterCustomerId, IsLast = page.Count < pageSize };
        }

        public ISet<string> FindExistingDedupeKeys(Guid setupId, string periodKey, IReadOnlyCollection<string> dedupeKeys) =>
            new HashSet<string>(GetDedupeKeys(setupId, periodKey).Where(dedupeKeys.Contains));

        public ISet<string> GetDedupeKeys(Guid setupId, string periodKey) =>
            new HashSet<string>(_pipeline.Invitations.Where(i => i.SetupId == setupId && i.SchedulePeriodKey == periodKey).Select(i => i.DedupeKey));

        public IReadOnlyList<PostponedInvitation> GetPostponed() => Postponed.ToList();

        // A release becomes a sent invitation, so the fatigue check sees it for the customer's next one.
        public bool TryRelease(PostponedInvitation invitation, DateTime nowUtc)
        {
            if (ChangedElsewhere.Contains(invitation.Id)) return false;
            Released.Add(invitation.Id);
            _pipeline.Invitations.Add(new InvitationDraft { CustomerId = invitation.CustomerId, GeneratedOn = nowUtc, Status = InvitationStatus.Pending, DedupeKey = invitation.Id.ToString() });
            return true;
        }

        public bool TryDiscard(PostponedInvitation invitation)
        {
            if (ChangedElsewhere.Contains(invitation.Id)) return false;
            Discarded.Add(invitation.Id);
            return true;
        }

        public IReadOnlyList<Guid> FindSubmittedBefore(DateTime cutoffUtc) => Responses.Where(r => r.Value.Item1 < cutoffUtc).Select(r => r.Key).ToList();

        public IReadOnlyList<Guid> FindIdentifiedSubmittedBefore(DateTime cutoffUtc) =>
            Responses.Where(r => r.Value.Item1 < cutoffUtc && r.Value.Item2).Select(r => r.Key).ToList();

        // IResponseRetentionStore — explicit to avoid ambiguity with the two other Delete(Guid) methods.
        void IResponseRetentionStore.Delete(Guid responseId) => Deleted.Add(responseId);

        public void Anonymise(Guid responseId) => Anonymised.Add(responseId);

        // IInvitationRetentionStore
        IReadOnlyList<Guid> IInvitationRetentionStore.FindGeneratedBefore(DateTime cutoffUtc) =>
            InvitationGeneratedOn.Where(kv => kv.Value < cutoffUtc).Select(kv => kv.Key).ToList();

        void IInvitationRetentionStore.Delete(Guid invitationId) => DeletedInvitations.Add(invitationId);

        // ISuppressionLogRetentionStore
        IReadOnlyList<Guid> ISuppressionLogRetentionStore.FindCreatedBefore(DateTime cutoffUtc) =>
            SuppressionLogCreatedOn.Where(kv => kv.Value < cutoffUtc).Select(kv => kv.Key).ToList();

        void ISuppressionLogRetentionStore.Delete(Guid suppressionLogId) => DeletedSuppressionLogs.Add(suppressionLogId);

        public RunDueSurveysDependencies AsDependencies() => new RunDueSurveysDependencies
        {
            Pipeline = _pipeline.AsDependencies(), ScheduledTriggers = this, Population = this, ScheduledInvitations = this, ScheduledRuns = this, Postponed = this,
            Retention = this, InvitationRetention = this, SuppressionLogRetention = this,
            OneTimeTriggers = OneTime, Audience = OneTime, CustomerTable = "account", DailyPassGate = OneTime,
        };
    }
}
