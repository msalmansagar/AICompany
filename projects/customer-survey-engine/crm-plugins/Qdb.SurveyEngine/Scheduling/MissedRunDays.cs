using System;
using System.Collections.Generic;
using System.Linq;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// Which run dates the daily passes must run for (DEF-CSE-003). Scheduled surveys are due only on the 1st, so
    /// a day the scheduler did not run (server down, a holiday freeze) would lose that period's surveys silently.
    /// Every date after the last completed one is run, oldest first, up to <see cref="MaxCatchUpDays"/>; older
    /// dates are named so an administrator can re-run them with RunDate. Re-running a date is safe: each period's
    /// invitation has a unique dedupe key.
    /// </summary>
    public sealed class MissedRunDays
    {
        /// <summary>
        /// Quarterly and annual invitations expire one month into the next period, and the shortest month has 28
        /// days, so a date caught up within 28 days always creates invitations before they would expire.
        /// </summary>
        public const int MaxCatchUpDays = 28;

        private MissedRunDays(IReadOnlyList<DateTime> dates, IReadOnlyList<DateTime> tooOld)
        {
            Dates = dates;
            TooOldCount = tooOld.Count;
            TooOldFrom = tooOld.Count > 0 ? tooOld.First() : (DateTime?)null;
            TooOldTo = tooOld.Count > 0 ? tooOld.Last() : (DateTime?)null;
        }

        /// <summary>The dates to run, oldest first; empty when the run date already completed.</summary>
        public IReadOnlyList<DateTime> Dates { get; }

        /// <summary>True when the daily passes already completed for the run date.</summary>
        public bool IsAlreadyCompleted => Dates.Count == 0;

        /// <summary>How many missed dates are older than <see cref="MaxCatchUpDays"/> and are not run.</summary>
        public int TooOldCount { get; }

        /// <summary>The first missed date not run, if any.</summary>
        public DateTime? TooOldFrom { get; }

        /// <summary>The last missed date not run, if any.</summary>
        public DateTime? TooOldTo { get; }

        /// <summary>The plan for a run on <paramref name="runDate"/> after the last completed date.</summary>
        public static MissedRunDays Plan(DateTime? lastCompleted, DateTime runDate)
        {
            var run = runDate.Date;
            if (lastCompleted?.Date == run) return new MissedRunDays(new DateTime[0], new DateTime[0]);
            // Never completed, or an administrator re-running an earlier date: just that date.
            if (lastCompleted == null || lastCompleted.Value.Date > run) return new MissedRunDays(new[] { run }, new DateTime[0]);
            var missed = DaysBetween(lastCompleted.Value.Date.AddDays(1), run);
            var oldest = run.AddDays(1 - MaxCatchUpDays);
            return new MissedRunDays(missed.Where(day => day >= oldest).ToList(), missed.Where(day => day < oldest).ToList());
        }

        private static List<DateTime> DaysBetween(DateTime first, DateTime last) =>
            Enumerable.Range(0, (last - first).Days + 1).Select(offset => first.AddDays(offset)).ToList();
    }
}
