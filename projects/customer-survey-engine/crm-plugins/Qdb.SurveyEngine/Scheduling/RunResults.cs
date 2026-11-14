using System.Collections.Generic;

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

    /// <summary>The answer of one Run Due Surveys call.</summary>
    public sealed class RunSummary
    {
        public RunSummary(PostponedReleaseResult postponed, ScheduledRunResult scheduled, RetentionResult retention)
        {
            Postponed = postponed;
            Scheduled = scheduled;
            Retention = retention;
        }

        public PostponedReleaseResult Postponed { get; }
        public ScheduledRunResult Scheduled { get; }
        public RetentionResult Retention { get; }

        /// <summary>False when the time budget ran out; the caller calls again until true.</summary>
        public bool IsComplete => Postponed.IsComplete && Scheduled.IsComplete && Retention.IsComplete;

        public override string ToString() =>
            $"{Postponed} {Scheduled} {Retention}" + (IsComplete ? string.Empty : " Time budget spent: call again to continue.");
    }
}
