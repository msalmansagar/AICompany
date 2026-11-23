using System.Globalization;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>What one scheduled run did in one call, and whether the pass may go on to the next run.</summary>
    public sealed class WorkOutcome
    {
        private WorkOutcome(string line, bool stopsThePass)
        {
            Line = line;
            StopsThePass = stopsThePass;
        }

        /// <summary>The run's line in the summary (FR-005).</summary>
        public string Line { get; }

        /// <summary>True when the run is not finished (budget spent, or another call owns it): the pass stops and says call again.</summary>
        public bool StopsThePass { get; }

        /// <summary>A configuration problem, reported among the summary's problems; empty otherwise.</summary>
        public string Problem { get; private set; } = string.Empty;

        /// <summary>Customers evaluated in this call.</summary>
        public int Evaluated { get; private set; }

        /// <summary>Customers of this call's pages that already had the period's invitation.</summary>
        public int AlreadyHad { get; private set; }

        /// <summary>"srv-quarterly 2026-Q4 running, 4200 evaluated (4100 invited, 80 postponed, 20 suppressed)".</summary>
        public static string Progress(ScheduledWork work, ScheduledRunState state) =>
            string.Format(CultureInfo.InvariantCulture, "{0} {1}, {2} evaluated ({3} invited, {4} postponed, {5} suppressed)",
                work.Name, state.Status == ScheduledRunStatus.Sent ? "completed" : "running", state.Evaluated, state.Invited, state.Postponed, state.Suppressed);

        public static WorkOutcome Completed(ScheduledWork work, ScheduledRunState state, int evaluated, int alreadyHad) =>
            new WorkOutcome(Progress(work, state), false) { Evaluated = evaluated, AlreadyHad = alreadyHad };

        /// <summary>The run was closed without sending (outside the window, delivery None); logged once.</summary>
        public static WorkOutcome NotSent(ScheduledWork work, string reason) => new WorkOutcome($"{work.Name} not sent: {reason}", false);

        public static WorkOutcome BudgetSpent(ScheduledWork work, ScheduledRunState state, int evaluated, int alreadyHad) =>
            new WorkOutcome(Progress(work, state), true) { Evaluated = evaluated, AlreadyHad = alreadyHad };

        public static WorkOutcome ChangedElsewhere(ScheduledWork work) =>
            new WorkOutcome($"{work.Name}: another scheduler call is working on this survey; call again.", true);

        public static WorkOutcome Skipped(ScheduledStep step) => step.IsProblem
            ? new WorkOutcome(string.Empty, false) { Problem = step.SkipReason }
            : new WorkOutcome($"{step.Work.Name} {step.SkipReason}", false);
    }
}
