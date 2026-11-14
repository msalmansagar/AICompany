using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// Generates the invitations of every scheduled trigger due on the run date (FR-CSE-031..033).
    /// Each customer goes through the same fatigue and priority rules as a record-driven trigger
    /// (<see cref="InvitationDispatcher"/>), so a customer due for two schedules on 1 January gets
    /// one survey and the other follows its Drop / Postpone setting. The period dedupe key makes a
    /// second run on the same day create nothing.
    /// </summary>
    public sealed class ScheduledTriggerPass
    {
        private readonly RunDueSurveysDependencies _deps;
        private readonly ScheduledCandidateBuilder _builder;
        private readonly InvitationDispatcher _dispatcher;

        public ScheduledTriggerPass(RunDueSurveysDependencies dependencies, ScheduledCandidateBuilder builder, InvitationDispatcher dispatcher)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            _builder = builder ?? throw new ArgumentNullException(nameof(builder));
            _dispatcher = dispatcher ?? throw new ArgumentNullException(nameof(dispatcher));
        }

        /// <summary>Runs the triggers due on <paramref name="runDate"/>, or as many customers as the budget allows.</summary>
        public ScheduledRunResult Run(DateTime runDate, RunBudget budget)
        {
            var result = new ScheduledRunResult();
            var due = _deps.ScheduledTriggers.GetActiveScheduledTriggers().Where(t => ScheduleCalendar.IsDue(t.Schedule.Period, runDate)).ToList();
            result.DueTriggers = due.Count;
            var settings = _deps.Pipeline.Config.GetSettings();
            var built = BuildAll(due, new ScheduledRunContext(runDate, settings, budget));
            if (built == null) { result.IsComplete = false; return Traced(result); }
            result.AlreadyGenerated = built.Sum(b => b.AlreadyGenerated);
            result.Problems.AddRange(built.Where(b => b.Problem != null).Select(b => b.Problem));
            foreach (var customer in built.SelectMany(b => b.Candidates).GroupBy(c => c.Evaluation.Change.CustomerId.Value))
            {
                if (budget.IsExhausted) { result.IsComplete = false; break; }
                _dispatcher.Dispatch(customer.ToList(), settings);
                result.CustomersEvaluated++;
            }
            return Traced(result);
        }

        // Every due trigger must be built before any customer is dispatched, or priority between two
        // schedules due for the same customer would be decided on half the candidates. A spent budget
        // here answers null so nothing is dispatched and the next call starts over.
        private IReadOnlyList<ScheduledTriggerCandidates> BuildAll(IReadOnlyList<SurveyTrigger> due, ScheduledRunContext context)
        {
            var built = new List<ScheduledTriggerCandidates>();
            foreach (var trigger in due)
            {
                if (context.Budget.IsExhausted) return null;
                built.Add(_builder.Build(new ScheduledRun(trigger, context.RunDate, context.Settings)));
            }
            return built;
        }

        private ScheduledRunResult Traced(ScheduledRunResult result)
        {
            _deps.Pipeline.Trace.Write(result.ToString());
            return result;
        }

        private sealed class ScheduledRunContext
        {
            public ScheduledRunContext(DateTime runDate, SurveySettings settings, RunBudget budget)
            {
                RunDate = runDate;
                Settings = settings;
                Budget = budget;
            }

            public DateTime RunDate { get; }
            public SurveySettings Settings { get; }
            public RunBudget Budget { get; }
        }
    }
}
