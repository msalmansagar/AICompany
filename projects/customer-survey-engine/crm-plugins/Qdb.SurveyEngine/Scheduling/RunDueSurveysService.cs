using System;
using System.Collections.Generic;
using System.Linq;
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
        private readonly ScheduledFailureRecorder _failures;

        public RunDueSurveysService(OneTimeDuePass oneTime, DailyPasses daily, IDailyPassGate gate, ScheduledFailureRecorder failures)
        {
            _oneTime = oneTime ?? throw new ArgumentNullException(nameof(oneTime));
            _daily = daily ?? throw new ArgumentNullException(nameof(daily));
            _gate = gate ?? throw new ArgumentNullException(nameof(gate));
            _failures = failures ?? throw new ArgumentNullException(nameof(failures));
        }

        /// <summary>The composition root's wiring: validates every dependency and builds the service graph.</summary>
        public static RunDueSurveysService Compose(RunDueSurveysDependencies dependencies)
        {
            RequireAll(dependencies);
            var pipeline = dependencies.Pipeline;
            var suppressions = new SuppressionRecorder(pipeline);
            var scheduled = new ScheduledTriggerPass(dependencies, new ScheduledRunChecks(pipeline, suppressions), new ScheduledPageRunner(dependencies));
            var daily = new DailyPasses(new PostponedReleasePass(dependencies), scheduled, new RetentionPass(dependencies));
            var sender = new OneTimeSendService(new OneTimeSendDependencies
            {
                Pipeline = pipeline, Triggers = dependencies.OneTimeTriggers, Audience = dependencies.Audience,
                GeneratedKeys = dependencies.ScheduledInvitations, CustomerTable = dependencies.CustomerTable, StartedBy = dependencies.CallerId,
            });
            return new RunDueSurveysService(new OneTimeDuePass(dependencies.OneTimeTriggers, sender, pipeline), daily, dependencies.DailyPassGate,
                new ScheduledFailureRecorder(dependencies));
        }

        /// <summary>Runs every pass due for <paramref name="runDate"/> within <paramref name="budget"/>.</summary>
        public RunSummary Run(DateTime runDate, RunBudget budget) => Run(runDate, budget, RunPass.All);

        /// <summary>Runs the chosen passes due for <paramref name="runDate"/> within <paramref name="budget"/>.</summary>
        public RunSummary Run(DateTime runDate, RunBudget budget, RunPass pass)
        {
            if (budget == null) throw new ArgumentNullException(nameof(budget));
            if (pass == RunPass.RecordFailure) return RunSummary.FailureRecorded(_failures.Record(runDate));
            var oneTime = pass == RunPass.Daily ? OneTimeDueResult.NotRun() : _oneTime.Run(budget);
            if (pass == RunPass.OneTime) return RunSummary.DailyNotRequested(oneTime);
            var lastCompleted = _gate.LastCompletedOn();
            var plan = MissedRunDays.Plan(lastCompleted, runDate);
            return plan.IsAlreadyCompleted ? RunSummary.OneTimeOnly(oneTime) : RunDailyDates(oneTime, plan, new DailyRunContext(lastCompleted, budget));
        }

        // Runs the daily passes for each planned date, oldest first; a date counts as done only when its passes
        // finish, so a run cut by the budget resumes from the last finished date on the next call (DEF-CSE-003).
        private RunSummary RunDailyDates(OneTimeDueResult oneTime, MissedRunDays plan, DailyRunContext context)
        {
            var caughtUp = new List<string>();
            RunSummary summary = null;
            foreach (var date in plan.Dates)
            {
                summary = _daily.Run(oneTime, date, context.Budget);
                if (!summary.AreDailyPassesComplete) break;
                RememberCompleted(date, context.LastCompleted);
                if (date != plan.Dates.Last()) caughtUp.Add($"Missed day {date:yyyy-MM-dd}: {summary.Scheduled}");
            }
            return summary.WithMissedDays(caughtUp, plan);
        }

        // Never moves the date back: an administrator re-running an earlier date leaves the later one standing.
        private void RememberCompleted(DateTime date, DateTime? lastCompleted)
        {
            if (lastCompleted == null || date > lastCompleted.Value) _gate.MarkCompleted(date);
        }

        private sealed class DailyRunContext
        {
            public DailyRunContext(DateTime? lastCompleted, RunBudget budget)
            {
                LastCompleted = lastCompleted;
                Budget = budget;
            }

            public DateTime? LastCompleted { get; }
            public RunBudget Budget { get; }
        }

        private static void RequireAll(RunDueSurveysDependencies dependencies)
        {
            if (dependencies == null) throw new ArgumentNullException(nameof(dependencies));
            var pipeline = dependencies.Pipeline;
            if (pipeline == null || pipeline.Config == null || pipeline.Languages == null || pipeline.RenderCache == null || pipeline.Invitations == null
                || pipeline.Suppressions == null || pipeline.Clock == null || pipeline.Trace == null)
                throw new ArgumentException("Pipeline needs Config, Languages, RenderCache, Invitations, Suppressions, Clock and Trace.", nameof(dependencies));
            if (dependencies.ScheduledTriggers == null || dependencies.Population == null || dependencies.ScheduledInvitations == null
                || dependencies.ScheduledRuns == null || dependencies.Postponed == null || dependencies.Retention == null)
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
