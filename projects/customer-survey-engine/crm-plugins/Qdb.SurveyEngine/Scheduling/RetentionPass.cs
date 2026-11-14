using System;
using System.Collections.Generic;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// Deletes or anonymises responses older than the retention period (FR-CSE-058). Off until
    /// QDB Compliance sets both the period and the mode (OQ-A1): a period without a mode does
    /// nothing, because guessing between deleting and keeping personal data is not this code's call.
    /// </summary>
    public sealed class RetentionPass
    {
        private readonly RunDueSurveysDependencies _deps;

        public RetentionPass(RunDueSurveysDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
        }

        /// <summary>Applies retention to every response past the period, or as many as the budget allows.</summary>
        public RetentionResult Run(RunBudget budget)
        {
            var settings = _deps.Pipeline.Config.GetSettings();
            var result = Apply(settings, budget);
            _deps.Pipeline.Trace.Write(result.ToString());
            return result;
        }

        private RetentionResult Apply(SurveySettings settings, RunBudget budget)
        {
            if (!settings.RetentionDays.HasValue || settings.RetentionDays.Value <= 0) return new RetentionResult();
            if (!settings.RetentionMode.HasValue) return new RetentionResult { Outcome = $"Retention: {settings.RetentionDays} days is set but no mode is chosen, so nothing was done." };
            var cutoff = _deps.Pipeline.Clock.UtcNow.AddDays(-settings.RetentionDays.Value);
            return settings.RetentionMode.Value == RetentionMode.Delete
                ? Process(_deps.Retention.FindSubmittedBefore(cutoff), _deps.Retention.Delete, "deleted", budget)
                : Process(_deps.Retention.FindIdentifiedSubmittedBefore(cutoff), _deps.Retention.Anonymise, "anonymised", budget);
        }

        private static RetentionResult Process(IReadOnlyList<Guid> responseIds, Action<Guid> apply, string verb, RunBudget budget)
        {
            var done = 0;
            foreach (var responseId in responseIds)
            {
                if (budget.IsExhausted) return new RetentionResult { Outcome = $"Retention: {done} of {responseIds.Count} responses {verb}.", IsComplete = false };
                apply(responseId);
                done++;
            }
            return new RetentionResult { Outcome = $"Retention: {done} response(s) {verb}." };
        }
    }
}
