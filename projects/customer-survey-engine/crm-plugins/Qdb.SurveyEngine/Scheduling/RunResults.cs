using System.Collections.Generic;
using Qdb.SurveyEngine.OneTime;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>What the postponed-release pass did (FR-CSE-042).</summary>
    public sealed class PostponedReleaseResult
    {
        public int Released { get; set; }
        public int Discarded { get; set; }
        public int StillWaiting { get; set; }

        /// <summary>Rows another process changed between read and update; they are left alone.</summary>
        public int ChangedElsewhere { get; set; }

        public bool IsComplete { get; set; } = true;

        public override string ToString() =>
            $"Postponed: {Released} released, {Discarded} discarded, {StillWaiting} still waiting, {ChangedElsewhere} changed elsewhere.";
    }

    /// <summary>What the scheduled-trigger pass did (FR-CSE-031..033, FR-005).</summary>
    public sealed class ScheduledRunResult
    {
        /// <summary>Runs selected: triggers due on the run date plus unfinished runs (ADR-011).</summary>
        public int DueTriggers { get; set; }

        /// <summary>Customers evaluated in this call.</summary>
        public int CustomersEvaluated { get; set; }

        /// <summary>Customers that already had this period's invitation (a redone page); skipped, not logged.</summary>
        public int AlreadyGenerated { get; set; }

        /// <summary>Triggers due today whose run for the period was already sent.</summary>
        public int AlreadySent { get; set; }

        /// <summary>Triggers skipped because they are misconfigured, with the reason.</summary>
        public List<string> Problems { get; } = new List<string>();

        /// <summary>One line per run worked on or skipped: running, completed, Stuck, not sent.</summary>
        public List<string> Runs { get; } = new List<string>();

        public bool IsComplete { get; set; } = true;

        /// <summary>Adds one run's outcome to the totals and lines.</summary>
        public void Add(WorkOutcome outcome)
        {
            if (outcome == null) throw new System.ArgumentNullException(nameof(outcome));
            CustomersEvaluated += outcome.Evaluated;
            AlreadyGenerated += outcome.AlreadyHad;
            if (outcome.Problem.Length > 0) Problems.Add(outcome.Problem);
            if (outcome.Line.Length > 0) Runs.Add(outcome.Line + ".");
        }

        public override string ToString() =>
            $"Scheduled: {DueTriggers} run(s) due or unfinished, {CustomersEvaluated} customer(s) evaluated, {AlreadyGenerated} already had this period's invitation."
            + (AlreadySent > 0 ? $" {AlreadySent} already sent for this period." : string.Empty)
            + (Runs.Count > 0 ? " " + string.Join(" ", Runs) : string.Empty)
            + (Problems.Count > 0 ? " Problems: " + string.Join(" ", Problems) : string.Empty);
    }

    /// <summary>What the retention pass did (FR-CSE-058).</summary>
    public sealed class RetentionResult
    {
        public string Outcome { get; set; } = "Retention: off.";
        public bool IsComplete { get; set; } = true;

        public override string ToString() => Outcome;
    }

    /// <summary>
    /// The answer of one Run Due Surveys call. The once-a-day passes (postponed, scheduled, retention)
    /// are null when they already completed for the run date (ADR-010).
    /// </summary>
    public sealed class RunSummary
    {
        public RunSummary(PostponedReleaseResult postponed, ScheduledRunResult scheduled, RetentionResult retention)
            : this(new OneTimeDueResult(), postponed, scheduled, retention)
        {
        }

        private RunSummary(OneTimeDueResult oneTime, PostponedReleaseResult postponed, ScheduledRunResult scheduled, RetentionResult retention)
        {
            OneTime = oneTime ?? throw new System.ArgumentNullException(nameof(oneTime));
            Postponed = postponed;
            Scheduled = scheduled;
            Retention = retention;
        }

        /// <summary>A call that ran the One-time pass and every daily pass.</summary>
        public static RunSummary Full(OneTimeDueResult oneTime, PostponedReleaseResult postponed, ScheduledRunResult scheduled, RetentionResult retention) =>
            new RunSummary(oneTime, postponed, scheduled, retention);

        /// <summary>A call after the daily passes had already completed for the run date.</summary>
        public static RunSummary OneTimeOnly(OneTimeDueResult oneTime) => new RunSummary(oneTime, null, null, null);

        /// <summary>A call asked for the One-time pass only (Pass = OneTime); the daily passes have their own call.</summary>
        public static RunSummary DailyNotRequested(OneTimeDueResult oneTime) =>
            new RunSummary(oneTime, null, null, null) { DailySkippedBecause = "Daily passes: not run in this call (Pass = OneTime)." };

        /// <summary>A Pass = RecordFailure call: no survey work, only the failed-call count (FR-011).</summary>
        public static RunSummary FailureRecorded(string outcome) =>
            new RunSummary(OneTimeDueResult.NotRun(), null, null, null) { DailySkippedBecause = outcome };

        // Why the daily passes did not run, when they did not.
        private string DailySkippedBecause { get; set; } = "Daily passes: already completed for this date.";

        // Missed run dates this call caught up, and those too old to catch up (DEF-CSE-003); empty when none.
        private string MissedDaysNote { get; set; } = string.Empty;

        /// <summary>This summary with the missed dates caught up before the run date, and any too old to catch up, named.</summary>
        public RunSummary WithMissedDays(IReadOnlyList<string> caughtUp, MissedRunDays plan)
        {
            if (plan == null) throw new System.ArgumentNullException(nameof(plan));
            var notes = new List<string>(caughtUp ?? new string[0]);
            if (plan.TooOldCount > 0)
                notes.Add($"NOT caught up, older than {MissedRunDays.MaxCatchUpDays} days: {plan.TooOldCount} day(s) from {plan.TooOldFrom:yyyy-MM-dd} to {plan.TooOldTo:yyyy-MM-dd}; re-run each with RunDate.");
            return new RunSummary(OneTime, Postponed, Scheduled, Retention) { DailySkippedBecause = DailySkippedBecause, MissedDaysNote = string.Join(" ", notes) };
        }

        public OneTimeDueResult OneTime { get; }
        public PostponedReleaseResult Postponed { get; }
        public ScheduledRunResult Scheduled { get; }
        public RetentionResult Retention { get; }

        /// <summary>True when the daily passes ran in this call.</summary>
        public bool RanDailyPasses => Postponed != null;

        /// <summary>True when every daily pass that ran finished; false before they ran.</summary>
        public bool AreDailyPassesComplete => RanDailyPasses && Postponed.IsComplete && Scheduled.IsComplete && Retention.IsComplete;

        /// <summary>False when the time budget ran out; the caller calls again until true.</summary>
        public bool IsComplete => OneTime.IsComplete && (!RanDailyPasses || AreDailyPassesComplete);

        public override string ToString() =>
            $"{OneTime} " + (MissedDaysNote.Length > 0 ? MissedDaysNote + " " : string.Empty)
            + (RanDailyPasses ? $"{Postponed} {Scheduled} {Retention}" : DailySkippedBecause)
            + (IsComplete ? string.Empty : " Time budget spent: call again to continue.");
    }
}
