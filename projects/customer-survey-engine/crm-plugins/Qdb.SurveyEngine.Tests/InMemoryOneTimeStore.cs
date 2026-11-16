using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>In-memory One-time triggers, audience and daily gate over an <see cref="InMemorySurveyStore"/>.</summary>
    public sealed class InMemoryOneTimeStore : IOneTimeTriggerStore, IAudienceReader, IDailyPassGate
    {
        private readonly InMemorySurveyStore _pipeline;

        public InMemoryOneTimeStore(InMemorySurveyStore pipeline)
        {
            _pipeline = pipeline;
        }

        public Dictionary<Guid, OneTimeTrigger> Triggers { get; } = new Dictionary<Guid, OneTimeTrigger>();
        public List<Guid> AudienceCustomers { get; } = new List<Guid>();
        public List<int> PagesRead { get; } = new List<int>();
        public List<OneTimeRunState> SavedProgress { get; } = new List<OneTimeRunState>();
        public string FailReason { get; private set; }
        public bool IsStartRaceLost { get; set; }

        /// <summary>How far the clock moves per page read, to spend a run budget.</summary>
        public TimeSpan ClockStepPerPage { get; set; } = TimeSpan.Zero;

        public DateTime? DailyPassesCompletedOn { get; set; }

        public OneTimeTrigger Find(Guid triggerId) => Triggers.TryGetValue(triggerId, out var trigger) ? trigger : null;

        public IReadOnlyList<Guid> GetDueTriggerIds(DateTime nowUtc) => Triggers.Values
            .Where(t => t.IsTriggerActive && t.IsSetupActive && t.SendOn.HasValue && t.SendOn <= nowUtc)
            .Where(t => t.Run.Status == OneTimeRunStatus.NotSent || t.Run.Status == OneTimeRunStatus.Sending)
            .OrderBy(t => t.SendOn).Select(t => t.Trigger.Id).ToList();

        public bool TryStart(OneTimeTrigger trigger, DateTime nowUtc)
        {
            if (IsStartRaceLost) return false;
            trigger.Run = new OneTimeRunState { Status = OneTimeRunStatus.Sending };
            return true;
        }

        public void SaveProgress(Guid triggerId, OneTimeRunState state)
        {
            SavedProgress.Add(state);
            Triggers[triggerId].Run = state;
        }

        public void Complete(Guid triggerId, OneTimeRunState state) => Triggers[triggerId].Run = state;

        public void Fail(Guid triggerId, string reason)
        {
            FailReason = reason;
            Triggers[triggerId].Run.Status = OneTimeRunStatus.Failed;
        }

        public AudiencePage ReadPage(AudienceQuery query, int pageNumber, string pagingCookie)
        {
            PagesRead.Add(pageNumber);
            _pipeline.UtcNow += ClockStepPerPage;
            var ids = AudienceCustomers.Skip((pageNumber - 1) * OneTimeSendService.PageSize).Take(OneTimeSendService.PageSize).ToList();
            return new AudiencePage { CustomerIds = ids, MoreRecords = pageNumber * OneTimeSendService.PageSize < AudienceCustomers.Count, PagingCookie = "cookie-" + pageNumber };
        }

        public int Count(AudienceQuery query) => AudienceCustomers.Count;

        public bool HasCompleted(DateTime runDate) => DailyPassesCompletedOn == runDate.Date;

        public void MarkCompleted(DateTime runDate) => DailyPassesCompletedOn = runDate.Date;
    }
}
