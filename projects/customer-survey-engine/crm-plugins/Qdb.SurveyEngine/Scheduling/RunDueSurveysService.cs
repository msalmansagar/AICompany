using System;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// The "Run Due Surveys" job (section 7, FR-CSE-033, 042, 058; Addendum D): due One-time triggers
    /// first, on every call; then, once per run date, postponed release, scheduled triggers and
    /// retention. Postponed invitations go before scheduled ones because they have waited longest.
    /// Every pass is idempotent, so calling again after a spent budget, or every 15 minutes, is safe.
    /// </summary>
    public sealed class RunDueSurveysService
    {
        private readonly OneTimeDuePass _oneTime;
        private readonly DailyPasses _daily;
        private readonly IDailyPassGate _gate;

        public RunDueSurveysService(OneTimeDuePass oneTime, DailyPasses daily, IDailyPassGate gate)
        {
            _oneTime = oneTime ?? throw new ArgumentNullException(nameof(oneTime));
            _daily = daily ?? throw new ArgumentNullException(nameof(daily));
            _gate = gate ?? throw new ArgumentNullException(nameof(gate));
        }

        /// <summary>The composition root's wiring: validates every dependency and builds the service graph.</summary>
        public static RunDueSurveysService Compose(RunDueSurveysDependencies dependencies)
        {
            RequireAll(dependencies);
            var pipeline = dependencies.Pipeline;
            var suppressions = new SuppressionRecorder(pipeline);
            var builder = new ScheduledCandidateBuilder(dependencies, suppressions, new FormPinner(pipeline, suppressions));
            var scheduled = new ScheduledTriggerPass(dependencies, builder, new InvitationDispatcher(pipeline, suppressions));
            var daily = new DailyPasses(new PostponedReleasePass(dependencies), scheduled, new RetentionPass(dependencies));
            var sender = new OneTimeSendService(new OneTimeSendDependencies
            {
                Pipeline = pipeline, Triggers = dependencies.OneTimeTriggers, Audience = dependencies.Audience,
                GeneratedKeys = dependencies.ScheduledInvitations, CustomerTable = dependencies.CustomerTable, StartedBy = dependencies.CallerId,
            });
            return new RunDueSurveysService(new OneTimeDuePass(dependencies.OneTimeTriggers, sender, pipeline), daily, dependencies.DailyPassGate);
        }

        /// <summary>Runs every pass due for <paramref name="runDate"/> within <paramref name="budget"/>.</summary>
        public RunSummary Run(DateTime runDate, RunBudget budget) => Run(runDate, budget, RunPass.All);

        /// <summary>Runs the chosen passes due for <paramref name="runDate"/> within <paramref name="budget"/>.</summary>
        public RunSummary Run(DateTime runDate, RunBudget budget, RunPass pass)
        {
            if (budget == null) throw new ArgumentNullException(nameof(budget));
            var oneTime = pass == RunPass.Daily ? OneTimeDueResult.NotRun() : _oneTime.Run(budget);
            if (pass == RunPass.OneTime) return RunSummary.DailyNotRequested(oneTime);
            if (_gate.HasCompleted(runDate.Date)) return RunSummary.OneTimeOnly(oneTime);
            var summary = _daily.Run(oneTime, runDate.Date, budget);
            if (summary.AreDailyPassesComplete) _gate.MarkCompleted(runDate.Date);
            return summary;
        }

        private static void RequireAll(RunDueSurveysDependencies dependencies)
        {
            if (dependencies == null) throw new ArgumentNullException(nameof(dependencies));
            var pipeline = dependencies.Pipeline;
            if (pipeline == null || pipeline.Config == null || pipeline.Languages == null || pipeline.RenderCache == null || pipeline.Invitations == null
                || pipeline.Suppressions == null || pipeline.Clock == null || pipeline.Trace == null)
                throw new ArgumentException("Pipeline needs Config, Languages, RenderCache, Invitations, Suppressions, Clock and Trace.", nameof(dependencies));
            if (dependencies.ScheduledTriggers == null || dependencies.Population == null || dependencies.ScheduledInvitations == null
                || dependencies.Postponed == null || dependencies.Retention == null)
                throw new ArgumentException("Every RunDueSurveysDependencies member is required.", nameof(dependencies));
            if (dependencies.InvitationRetention == null || dependencies.SuppressionLogRetention == null)
                throw new ArgumentException("InvitationRetention and SuppressionLogRetention are required (Addendum C).", nameof(dependencies));
            if (dependencies.OneTimeTriggers == null || dependencies.Audience == null || dependencies.DailyPassGate == null || string.IsNullOrWhiteSpace(dependencies.CustomerTable))
                throw new ArgumentException("OneTimeTriggers, Audience, DailyPassGate and CustomerTable are required (Addendum D).", nameof(dependencies));
        }
    }

    /// <summary>The once-a-day passes, in order: postponed release, scheduled triggers, retention.</summary>
    public sealed class DailyPasses
    {
        private readonly PostponedReleasePass _postponed;
        private readonly ScheduledTriggerPass _scheduled;
        private readonly RetentionPass _retention;

        public DailyPasses(PostponedReleasePass postponed, ScheduledTriggerPass scheduled, RetentionPass retention)
        {
            _postponed = postponed ?? throw new ArgumentNullException(nameof(postponed));
            _scheduled = scheduled ?? throw new ArgumentNullException(nameof(scheduled));
            _retention = retention ?? throw new ArgumentNullException(nameof(retention));
        }

        /// <summary>Runs the three passes and returns them with the One-time result already obtained.</summary>
        public RunSummary Run(OneTimeDueResult oneTime, DateTime runDate, RunBudget budget)
        {
            var postponed = _postponed.Run(budget);
            var scheduled = _scheduled.Run(runDate, budget);
            return RunSummary.Full(oneTime, postponed, scheduled, _retention.Run(budget));
        }
    }
}
