using System;
using System.Collections.Generic;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>One due trigger in one run, with the period it surveys.</summary>
    public sealed class ScheduledRun
    {
        public ScheduledRun(SurveyTrigger trigger, DateTime runDate, SurveySettings settings)
        {
            Trigger = trigger ?? throw new ArgumentNullException(nameof(trigger));
            Period = ScheduleCalendar.PeriodEndingOn(trigger.Schedule.Period, runDate);
            Settings = settings ?? throw new ArgumentNullException(nameof(settings));
        }

        public SurveyTrigger Trigger { get; }
        public ReviewedPeriod Period { get; }
        public SurveySettings Settings { get; }
    }

    /// <summary>What <see cref="ScheduledCandidateBuilder.Build"/> found for one trigger.</summary>
    public sealed class ScheduledTriggerCandidates
    {
        public IReadOnlyList<InvitationCandidate> Candidates { get; set; } = new InvitationCandidate[0];
        public int AlreadyGenerated { get; set; }

        /// <summary>Why the trigger was skipped as misconfigured; null when it was not.</summary>
        public string Problem { get; set; }
    }
}
