using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>One scheduled trigger's run of one period, with the run record it starts from (ADR-011).</summary>
    public sealed class ScheduledWork
    {
        public ScheduledWork(SurveyTrigger trigger, ReviewedPeriod period, ScheduledRunState state)
        {
            Trigger = trigger ?? throw new ArgumentNullException(nameof(trigger));
            Period = period ?? throw new ArgumentNullException(nameof(period));
            State = state ?? throw new ArgumentNullException(nameof(state));
        }

        public SurveyTrigger Trigger { get; }
        public ReviewedPeriod Period { get; }
        public ScheduledRunState State { get; }

        /// <summary>How the run is named in the summary: the setup's form code and the period, e.g. "srv-quarterly 2026-Q4".</summary>
        public string Name => $"{Trigger.Setup.FormCode} {Period.Key}";

        /// <summary>True when the run for this period has not started.</summary>
        public bool IsNew => State.Status == ScheduledRunStatus.NotSent;

        /// <summary>
        /// True for a Stuck run already tried or marked on or after the run date: it waits for the first Daily call
        /// of a later day (research R5), so the surveys after it can go on.
        /// </summary>
        public bool IsWaitingForRetry(DateTime runDate) =>
            State.Status == ScheduledRunStatus.Stuck && State.ProgressOn.HasValue && State.ProgressOn.Value.Date >= runDate.Date;

        /// <summary>Why the trigger cannot run as configured; empty when it can.</summary>
        public string ConfigurationProblem =>
            Trigger.Schedule.Population == SchedulePopulation.ActiveInPeriod && Trigger.Schedule.PopulationSource == null
                ? $"Trigger {Trigger.Id:D} is 'Active in period' but has no population source."
                : string.Empty;
    }

    /// <summary>A selected run and, when the pass must not work on it now, why.</summary>
    public sealed class ScheduledStep
    {
        public ScheduledStep(ScheduledWork work, string skipReason, bool isProblem)
        {
            Work = work;
            SkipReason = skipReason ?? string.Empty;
            IsProblem = isProblem;
        }

        public ScheduledWork Work { get; }

        /// <summary>Empty when the pass works on the run.</summary>
        public string SkipReason { get; }

        /// <summary>True when the skip is a configuration problem, reported in the summary's problems.</summary>
        public bool IsProblem { get; }

        public bool IsSkipped => SkipReason.Length > 0;
    }

    /// <summary>
    /// Which scheduled runs a Daily call works on, in order (FR-006, FR-010; research R2, R7 as amended): every
    /// unfinished run (Sending, or Stuck), then each trigger due on the run date, highest priority first. A
    /// trigger due while its previous period is unfinished gets two runs, the previous period first.
    /// </summary>
    public sealed class ScheduledSelection
    {
        private ScheduledSelection(IReadOnlyList<ScheduledWork> work, int alreadySent)
        {
            Work = work;
            AlreadySent = alreadySent;
        }

        public IReadOnlyList<ScheduledWork> Work { get; }

        /// <summary>Triggers due on the run date whose run for the period is already Sent.</summary>
        public int AlreadySent { get; }

        public static ScheduledSelection Of(IReadOnlyList<SurveyTrigger> triggers, DateTime runDate)
        {
            if (triggers == null) throw new ArgumentNullException(nameof(triggers));
            var ordered = triggers.OrderBy(trigger => trigger, Comparer<SurveyTrigger>.Create(PriorityRule.Compare)).ToList();
            return new ScheduledSelection(ordered.SelectMany(trigger => WorkFor(trigger, runDate)).ToList(), ordered.Count(trigger => IsAlreadySent(trigger, runDate)));
        }

        /// <summary>
        /// The runs in order, each with why it is skipped: a Stuck run waiting for its retry, a misconfigured trigger,
        /// or a later period of a trigger whose earlier run is skipped.
        /// </summary>
        public IEnumerable<ScheduledStep> Steps(DateTime runDate)
        {
            var setAside = new HashSet<Guid>();
            foreach (var work in Work)
            {
                var step = StepFor(work, runDate, setAside.Contains(work.Trigger.Id));
                if (step.IsSkipped) setAside.Add(work.Trigger.Id);
                yield return step;
            }
        }

        private static ScheduledStep StepFor(ScheduledWork work, DateTime runDate, bool isEarlierRunSkipped)
        {
            if (isEarlierRunSkipped) return new ScheduledStep(work, "waits for its previous period, which is not finished", false);
            if (work.IsWaitingForRetry(runDate)) return new ScheduledStep(work, $"is Stuck: {work.State.Message}", false);
            if (work.ConfigurationProblem.Length > 0) return new ScheduledStep(work, work.ConfigurationProblem, true);
            return new ScheduledStep(work, string.Empty, false);
        }

        private static IEnumerable<ScheduledWork> WorkFor(SurveyTrigger trigger, DateTime runDate)
        {
            var run = trigger.Schedule.Run ?? new ScheduledRunState();
            var stored = ReadPeriod(trigger.Schedule.Period, run.PeriodKey);
            var isResumable = IsResumable(run) && stored.Count == 1;
            if (isResumable) yield return new ScheduledWork(trigger, stored[0], run);
            foreach (var next in FindPeriodsToStart(trigger, new StoredRun(run, stored, isResumable), runDate))
                yield return new ScheduledWork(trigger, next, next.Key == run.PeriodKey ? run : Fresh(next, run.RowVersion));
        }

        // The period due on the run date; or, on a day nothing is due, the period that fell due while the stored run was
        // unfinished (still running, or finished only after that due date: CEO option A, convergence T044).
        private static IEnumerable<ReviewedPeriod> FindPeriodsToStart(SurveyTrigger trigger, StoredRun stored, DateTime runDate)
        {
            var period = trigger.Schedule.Period;
            if (ScheduleCalendar.IsDue(period, runDate))
            {
                var due = ScheduleCalendar.PeriodEndingOn(period, runDate);
                if (stored.Run.PeriodKey != due.Key || !(stored.IsResumable || stored.Run.Status == ScheduledRunStatus.Sent)) yield return due;
                yield break;
            }
            if (stored.Periods.Count == 0) yield break;
            var following = ScheduleCalendar.FollowingPeriod(period, stored.Periods[0]);
            if (following.EndExclusive <= runDate.Date && (stored.IsResumable || IsHeldUp(stored.Run, following))) yield return following;
        }

        // A Sent run finished on or after the next period's due date, so that period waited for it (FR-006). One that
        // finished earlier held nothing up: a period missed for another reason (trigger switched off) is not sent late.
        private static bool IsHeldUp(ScheduledRunState run, ReviewedPeriod following) =>
            run.Status == ScheduledRunStatus.Sent && run.ProgressOn.HasValue && run.ProgressOn.Value.Date >= following.EndExclusive;

        // Sending or Stuck; or not started yet but with failed calls counted (its first page keeps failing), so it keeps
        // its place on the days after its due date until it shows Stuck.
        private static bool IsResumable(ScheduledRunState run) =>
            run.IsUnfinished || (run.Status == ScheduledRunStatus.NotSent && run.FailedCalls > 0);

        // A record whose period key cannot be read (e.g. left by a One-time send before the trigger's kind was changed)
        // names no scheduled period.
        private static IReadOnlyList<ReviewedPeriod> ReadPeriod(SchedulePeriod period, string periodKey)
        {
            try
            {
                return new[] { ScheduleCalendar.PeriodFromKey(period, periodKey) };
            }
            catch (FormatException)
            {
                return new ReviewedPeriod[0];
            }
        }

        /// <summary>A trigger's stored run with its readable period (none or one) and whether it is resumed.</summary>
        private sealed class StoredRun
        {
            public StoredRun(ScheduledRunState run, IReadOnlyList<ReviewedPeriod> periods, bool isResumable)
            {
                Run = run;
                Periods = periods;
                IsResumable = isResumable;
            }

            public ScheduledRunState Run { get; }
            public IReadOnlyList<ReviewedPeriod> Periods { get; }
            public bool IsResumable { get; }
        }

        private static bool IsAlreadySent(SurveyTrigger trigger, DateTime runDate) =>
            ScheduleCalendar.IsDue(trigger.Schedule.Period, runDate)
            && trigger.Schedule.Run?.Status == ScheduledRunStatus.Sent
            && trigger.Schedule.Run.PeriodKey == ScheduleCalendar.PeriodEndingOn(trigger.Schedule.Period, runDate).Key;

        private static ScheduledRunState Fresh(ReviewedPeriod period, string rowVersion) =>
            new ScheduledRunState { PeriodKey = period.Key, RowVersion = rowVersion };
    }
}
