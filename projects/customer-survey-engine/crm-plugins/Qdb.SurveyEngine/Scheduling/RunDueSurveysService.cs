using System;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// The daily "Run Due Surveys" job (section 7, FR-CSE-033, 042, 058): postponed release, then
    /// scheduled triggers, then retention. Postponed invitations go first because they have waited
    /// longest; a scheduled invitation generated first would push them back another fatigue window.
    /// Every pass is idempotent, so calling again after a spent budget, or twice in a day, is safe.
    /// </summary>
    public sealed class RunDueSurveysService
    {
        private readonly PostponedReleasePass _postponed;
        private readonly ScheduledTriggerPass _scheduled;
        private readonly RetentionPass _retention;

        public RunDueSurveysService(PostponedReleasePass postponed, ScheduledTriggerPass scheduled, RetentionPass retention)
        {
            _postponed = postponed ?? throw new ArgumentNullException(nameof(postponed));
            _scheduled = scheduled ?? throw new ArgumentNullException(nameof(scheduled));
            _retention = retention ?? throw new ArgumentNullException(nameof(retention));
        }

        /// <summary>The composition root's wiring: validates every dependency and builds the service graph.</summary>
        public static RunDueSurveysService Compose(RunDueSurveysDependencies dependencies)
        {
            if (dependencies == null) throw new ArgumentNullException(nameof(dependencies));
            var pipeline = dependencies.Pipeline;
            if (pipeline == null || pipeline.Config == null || pipeline.Languages == null || pipeline.RenderCache == null || pipeline.Invitations == null
                || pipeline.Suppressions == null || pipeline.Clock == null || pipeline.Trace == null)
                throw new ArgumentException("Pipeline needs Config, Languages, RenderCache, Invitations, Suppressions, Clock and Trace.", nameof(dependencies));
            if (dependencies.ScheduledTriggers == null || dependencies.Population == null || dependencies.ScheduledInvitations == null
                || dependencies.Postponed == null || dependencies.Retention == null)
                throw new ArgumentException("Every RunDueSurveysDependencies member is required.", nameof(dependencies));
            var suppressions = new SuppressionRecorder(pipeline);
            var builder = new ScheduledCandidateBuilder(dependencies, suppressions, new FormPinner(pipeline, suppressions));
            var scheduled = new ScheduledTriggerPass(dependencies, builder, new InvitationDispatcher(pipeline, suppressions));
            return new RunDueSurveysService(new PostponedReleasePass(dependencies), scheduled, new RetentionPass(dependencies));
        }

        /// <summary>Runs the three passes for <paramref name="runDate"/> within <paramref name="budget"/>.</summary>
        public RunSummary Run(DateTime runDate, RunBudget budget)
        {
            if (budget == null) throw new ArgumentNullException(nameof(budget));
            var postponed = _postponed.Run(budget);
            var scheduled = _scheduled.Run(runDate.Date, budget);
            return new RunSummary(postponed, scheduled, _retention.Run(budget));
        }
    }
}
