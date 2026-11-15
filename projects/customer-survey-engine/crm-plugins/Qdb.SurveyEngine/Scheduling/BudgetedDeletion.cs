using System;
using System.Collections.Generic;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// Shared time-budgeted deletion loop used by all retention and erasure steps. Processes ids
    /// oldest-first; stops at the budget boundary so the caller can re-invoke cleanly.
    /// </summary>
    internal static class BudgetedDeletion
    {
        /// <summary>
        /// Applies <paramref name="apply"/> to each id in order, stopping when the budget is spent.
        /// Returns the count processed; <paramref name="isComplete"/> is false when the budget ran out
        /// before all ids were handled.
        /// </summary>
        internal static int Run(IReadOnlyList<Guid> ids, Action<Guid> apply, RunBudget budget, out bool isComplete)
        {
            var done = 0;
            foreach (var id in ids)
            {
                if (budget.IsExhausted) { isComplete = false; return done; }
                apply(id);
                done++;
            }
            isComplete = true;
            return done;
        }
    }
}
