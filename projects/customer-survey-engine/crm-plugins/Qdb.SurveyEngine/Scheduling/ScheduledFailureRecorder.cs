using System;
using System.Globalization;
using System.Linq;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>Thrown when Run Due Surveys must not do what it was asked; the message says what to fix.</summary>
    public sealed class ScheduledRunRefusedException : Exception
    {
        public ScheduledRunRefusedException(string message) : base(message)
        {
        }
    }

    /// <summary>
    /// Pass = RecordFailure (FR-011, research R5): adds one failed call to the scheduled run the Daily pass would work
    /// on next for the run date (also a run not yet started, whose first page keeps failing, analysis C1) and marks it
    /// Stuck at the Survey Settings threshold. The Daily pass then sets it aside until a later day, so the surveys after
    /// it go on. Never sends anything.
    /// </summary>
    public sealed class ScheduledFailureRecorder
    {
        private const string ThresholdLabel = "Stuck After Failed Calls";
        private readonly RunDueSurveysDependencies _deps;

        public ScheduledFailureRecorder(RunDueSurveysDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
        }

        /// <summary>Records the failure and answers what was recorded, for the summary.</summary>
        public string Record(DateTime runDate)
        {
            var threshold = _deps.Pipeline.Config.GetSettings().StuckAfterFailedCalls
                ?? throw new ScheduledRunRefusedException($"Survey Settings '{ThresholdLabel}' is empty. Set it (for example 3) before the scheduler can count failed calls.");
            var selection = ScheduledSelection.Of(_deps.ScheduledTriggers.GetActiveScheduledTriggers(), runDate);
            var target = selection.Steps(runDate).Where(step => !step.IsSkipped).Select(step => step.Work).Take(1).ToList();
            if (target.Count == 0) return $"RecordFailure: no scheduled survey is running or due for {runDate:yyyy-MM-dd}; nothing to record.";
            return Save(target[0], Counted(target[0], threshold));
        }

        private ScheduledRunState Counted(ScheduledWork work, int threshold)
        {
            var next = work.State.Copy();
            next.PeriodKey = work.Period.Key;
            next.FailedCalls++;
            next.ProgressOn = _deps.Pipeline.Clock.UtcNow;
            var isStuck = next.FailedCalls >= threshold;
            if (isStuck) next.Status = ScheduledRunStatus.Stuck;
            next.Message = string.Format(CultureInfo.InvariantCulture,
                "The daily call failed {0} time(s) in a row while this survey was next (Stuck after {1}). {2}", next.FailedCalls, threshold,
                isStuck ? "Find the error in the scheduler log and the plugin trace log; after it is fixed the run resumes from its saved position on the first Daily call of a later day."
                        : "The next call retries from the saved position.");
            return next;
        }

        private string Save(ScheduledWork work, ScheduledRunState counted)
        {
            var write = _deps.ScheduledRuns.TrySave(work.Trigger.Id, counted);
            if (!write.IsSaved) return $"RecordFailure: {work.Name} changed while recording; nothing recorded.";
            _deps.Pipeline.Trace.Write($"RecordFailure: trigger {work.Trigger.Id:D}, {work.Name}: {counted.Message}");
            return $"RecordFailure: {work.Name} {(counted.Status == ScheduledRunStatus.Stuck ? "is Stuck" : "failed call counted")}: {counted.Message}";
        }
    }
}
