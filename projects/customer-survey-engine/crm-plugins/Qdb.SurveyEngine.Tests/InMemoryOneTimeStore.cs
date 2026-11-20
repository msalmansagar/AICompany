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

        /// <summary>Progress writes after this many succeed are lost to "another run" (null = never).</summary>
        public int? SavesBeforeRaceLost { get; set; }

        private int _rowVersion;

        private RunWrite Won() => RunWrite.Saved((++_rowVersion).ToString());

        /// <summary>Who each started send was recorded as started by.</summary>
        public List<Guid> StartedBy { get; } = new List<Guid>();

        public RunWrite TryStart(OneTimeTrigger trigger, DateTime nowUtc, Guid startedBy)
        {
            if (IsStartRaceLost) return RunWrite.Lost();
            StartedBy.Add(startedBy);
            trigger.Run = new OneTimeRunState { Status = OneTimeRunStatus.Sending };
            return Won();
        }

        public RunWrite TrySaveProgress(Guid triggerId, OneTimeRunState state)
        {
            if (SavesBeforeRaceLost.HasValue && SavedProgress.Count >= SavesBeforeRaceLost.Value) return RunWrite.Lost();
            SavedProgress.Add(state);
            Triggers[triggerId].Run = state;
            return Won();
        }

        public RunWrite TryComplete(Guid triggerId, OneTimeRunState state)
        {
            Triggers[triggerId].Run = state;
            return Won();
        }

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

        public DateTime? LastCompletedOn() => DailyPassesCompletedOn;

        public void MarkCompleted(DateTime runDate) => DailyPassesCompletedOn = runDate.Date;
    }
}
