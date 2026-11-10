using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>In-memory scheduling collaborators over an <see cref="InMemorySurveyStore"/>, so the daily job runs for real.</summary>
    public sealed class InMemorySchedulingStore : IScheduledTriggerRepository, ICustomerPopulationReader, IScheduledInvitationReader, IPostponedInvitationStore, IResponseRetentionStore
    {
        private readonly InMemorySurveyStore _pipeline;

        public InMemorySchedulingStore(InMemorySurveyStore pipeline)
        {
            _pipeline = pipeline;
        }

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

        public IReadOnlyList<SurveyTrigger> GetActiveScheduledTriggers() => ScheduledTriggers;

        public IReadOnlyList<Guid> GetActiveCustomers() => ActiveCustomers;

        public IReadOnlyList<Guid> GetCustomersActiveIn(PopulationQuery query)
        {
            LastPopulationQuery = query;
            return CustomersActiveInPeriod;
        }

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

        public void Delete(Guid responseId) => Deleted.Add(responseId);

        public void Anonymise(Guid responseId) => Anonymised.Add(responseId);

        public RunDueSurveysDependencies AsDependencies() => new RunDueSurveysDependencies
        {
            Pipeline = _pipeline.AsDependencies(), ScheduledTriggers = this, Population = this, ScheduledInvitations = this, Postponed = this, Retention = this,
        };
    }
}
