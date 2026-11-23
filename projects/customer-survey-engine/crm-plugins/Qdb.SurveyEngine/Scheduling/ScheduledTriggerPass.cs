using System;
using System.Collections.Generic;
using System.Globalization;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// Sends scheduled triggers' surveys (FR-CSE-031..033, FR-CSE-098; ADR-011): one run at a time in priority order,
    /// 25 customers per page, saving the run record on the trigger after each page and stopping between pages when
    /// the budget is spent, so a 10,000-customer survey resumes across the scheduler's calls. A Custom API call is ONE
    /// transaction: a call that fails loses only its own pages, which the next call redoes (DEF-CSE-002).
    /// </summary>
    public sealed class ScheduledTriggerPass
    {
        private readonly RunDueSurveysDependencies _deps;
        private readonly ScheduledRunChecks _checks;
        private readonly ScheduledPageRunner _pages;

        public ScheduledTriggerPass(RunDueSurveysDependencies dependencies, ScheduledRunChecks checks, ScheduledPageRunner pages)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            _checks = checks ?? throw new ArgumentNullException(nameof(checks));
            _pages = pages ?? throw new ArgumentNullException(nameof(pages));
        }

        /// <summary>Works through the selected runs for <paramref name="runDate"/> until all finish or the budget is spent.</summary>
        // Implements: FR-CSE-098, NFR-CSE-006/019; spec 001-scale-per-org FR-001, FR-004..FR-007, FR-010, FR-011.
        public ScheduledRunResult Run(DateTime runDate, RunBudget budget)
        {
            _deps.Pipeline.Trace.Write($"Scheduled pass for {runDate:yyyy-MM-dd} starting.");
            var selection = ScheduledSelection.Of(_deps.ScheduledTriggers.GetActiveScheduledTriggers(), runDate);
            var result = new ScheduledRunResult { DueTriggers = selection.Work.Count, AlreadySent = selection.AlreadySent };
            var call = new PassCall(_deps.Pipeline.Config.GetSettings(), budget);
            foreach (var step in selection.Steps(runDate))
            {
                var outcome = step.IsSkipped ? WorkOutcome.Skipped(step) : Send(step.Work, call);
                result.Add(outcome);
                if (outcome.StopsThePass) { result.IsComplete = false; break; }
            }
            _deps.Pipeline.Trace.Write(result.ToString());
            return result;
        }

        private WorkOutcome Send(ScheduledWork work, PassCall call)
        {
            if (call.Budget.IsExhausted) return WorkOutcome.BudgetSpent(work, work.State, 0, 0);
            var start = StartingState(work, call);
            var claim = _deps.ScheduledRuns.TrySave(work.Trigger.Id, start);
            if (!claim.IsSaved) return WorkOutcome.ChangedElsewhere(work);
            var state = call.Remember(work, start, claim.RowVersion);
            if (!work.IsNew) return SendPages(work, state, call);
            var check = _checks.Check(work.Trigger);
            return check.IsSendable ? SendPages(work, state, call) : FinishUnsendable(work, state, check.Reason, call);
        }

        // Starting or resuming re-writes the record conditionally, so of two overlapping calls only one goes on.
        private ScheduledRunState StartingState(ScheduledWork work, PassCall call)
        {
            var now = _deps.Pipeline.Clock.UtcNow;
            var start = work.IsNew
                ? new ScheduledRunState { PeriodKey = work.Period.Key, StartedOn = now, FailedCalls = work.State.FailedCalls }
                : work.State.Copy();
            start.Status = ScheduledRunStatus.Sending;
            start.ProgressOn = now;
            start.RowVersion = call.RowVersionOf(work);
            return start;
        }

        private WorkOutcome SendPages(ScheduledWork work, ScheduledRunState state, PassCall call)
        {
            var tally = new PageTally();
            while (!call.Budget.IsExhausted)
            {
                var page = _pages.Run(work, state, call.Settings);
                tally.Add(page);
                var next = WithProgressMessage(work, page.State);
                var write = _deps.ScheduledRuns.TrySave(work.Trigger.Id, next);
                if (!write.IsSaved) return WorkOutcome.ChangedElsewhere(work);
                state = call.Remember(work, next, write.RowVersion);
                TracePage(work, state, tally);
                if (state.Status == ScheduledRunStatus.Sent) return WorkOutcome.Completed(work, state, tally.Evaluated, tally.AlreadyHad);
            }
            return WorkOutcome.BudgetSpent(work, state, tally.Evaluated, tally.AlreadyHad);
        }

        private WorkOutcome FinishUnsendable(ScheduledWork work, ScheduledRunState state, string reason, PassCall call)
        {
            var finished = state.Copy();
            finished.Status = ScheduledRunStatus.Sent;
            finished.Message = "Not sent: " + reason;
            var write = _deps.ScheduledRuns.TrySave(work.Trigger.Id, finished);
            if (!write.IsSaved) return WorkOutcome.ChangedElsewhere(work);
            call.Remember(work, finished, write.RowVersion);
            return WorkOutcome.NotSent(work, reason);
        }

        private static ScheduledRunState WithProgressMessage(ScheduledWork work, ScheduledRunState state)
        {
            var next = state.Copy();
            next.Message = WorkOutcome.Progress(work, next);
            return next;
        }

        // Article XIV: one trace line per page, so a slow or failing page can be found in the plugin trace log.
        private void TracePage(ScheduledWork work, ScheduledRunState state, PageTally tally) =>
            _deps.Pipeline.Trace.Write(string.Format(CultureInfo.InvariantCulture, "Scheduled page: trigger {0:D}, {1}; page {2} done; {3}",
                work.Trigger.Id, work.Name, tally.Pages, WorkOutcome.Progress(work, state)));

        /// <summary>What one call shares across runs: settings, budget, and each trigger's latest row version.</summary>
        private sealed class PassCall
        {
            private readonly Dictionary<Guid, string> _rowVersions = new Dictionary<Guid, string>();

            public PassCall(SurveySettings settings, RunBudget budget)
            {
                Settings = settings;
                Budget = budget;
            }

            public SurveySettings Settings { get; }
            public RunBudget Budget { get; }

            // A trigger's second run in one call (its next period) must use the version its first run wrote.
            public string RowVersionOf(ScheduledWork work) =>
                _rowVersions.TryGetValue(work.Trigger.Id, out var written) ? written : work.State.RowVersion;

            public ScheduledRunState Remember(ScheduledWork work, ScheduledRunState state, string rowVersion)
            {
                var saved = state.Copy();
                saved.RowVersion = rowVersion;
                _rowVersions[work.Trigger.Id] = rowVersion;
                return saved;
            }
        }

        private sealed class PageTally
        {
            public int Pages { get; private set; }
            public int Evaluated { get; private set; }
            public int AlreadyHad { get; private set; }

            public void Add(ScheduledPage page)
            {
                Pages++;
                Evaluated += page.Evaluated;
                AlreadyHad += page.AlreadyHad;
            }
        }
    }
}
