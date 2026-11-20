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

    /// <summary>What the scheduled-trigger pass did (FR-CSE-031..033).</summary>
    public sealed class ScheduledRunResult
    {
        public int DueTriggers { get; set; }
        public int CustomersEvaluated { get; set; }

        /// <summary>Customers that already had this period's invitation (a re-run); skipped, not logged.</summary>
        public int AlreadyGenerated { get; set; }

        /// <summary>Triggers skipped because they are misconfigured, with the reason.</summary>
        public List<string> Problems { get; } = new List<string>();

        public bool IsComplete { get; set; } = true;

        public override string ToString() =>
            $"Scheduled: {DueTriggers} trigger(s) due, {CustomersEvaluated} customer(s) evaluated, {AlreadyGenerated} already had this period's invitation."
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
