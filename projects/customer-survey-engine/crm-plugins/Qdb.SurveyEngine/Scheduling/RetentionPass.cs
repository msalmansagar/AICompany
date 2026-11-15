using System;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// Runs the three-step daily retention stage (Addendum C, FR-CSE-058/076/077): (1) responses
    /// deleted or anonymised, (2) invitations deleted, (3) suppression logs deleted. Steps run in
    /// that fixed order within the shared RunBudget; each step applies a floor so the daily pass
    /// never removes records that fatigue and milestone checks still need (FR-CSE-078, C.1.4).
    /// </summary>
    public sealed class RetentionPass
    {
        /// <summary>Minimum days an invitation is kept regardless of qdb_retention_days (FR-CSE-078).</summary>
        public const int InvitationFloorDays = 395;

        /// <summary>Minimum days a suppression log is kept regardless of qdb_retention_days (FR-CSE-078).</summary>
        public const int SuppressionLogFloorDays = 365;

        private readonly RunDueSurveysDependencies _deps;

        public RetentionPass(RunDueSurveysDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
        }

        /// <summary>Applies retention to all three tables, or as many as the budget allows.</summary>
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
            if (!settings.RetentionMode.HasValue)
                return new RetentionResult { Outcome = $"Retention: {settings.RetentionDays} days is set but no mode is chosen, so nothing was done." };
            return RunAllSteps(settings.RetentionDays.Value, settings.RetentionMode.Value, budget);
        }

        private RetentionResult RunAllSteps(int days, RetentionMode mode, RunBudget budget)
        {
            var responseDone = RunResponses(days, mode, budget, out bool responsesComplete);
            if (!responsesComplete) return Partial(responseDone, 0, 0, mode);

            var invitationDone = RunInvitations(days, budget, out bool invitationsComplete);
            if (!invitationsComplete) return Partial(responseDone, invitationDone, 0, mode);

            var suppressionDone = RunSuppressionLogs(days, budget, out bool suppressionsComplete);
            return new RetentionResult
            {
                Outcome = $"Retention: {responseDone} response(s) {Verb(mode)}, {invitationDone} invitation(s) deleted, {suppressionDone} suppression log(s) deleted.",
                IsComplete = suppressionsComplete,
            };
        }

        private int RunResponses(int days, RetentionMode mode, RunBudget budget, out bool isComplete)
        {
            var cutoff = _deps.Pipeline.Clock.UtcNow.AddDays(-days);
            var ids = mode == RetentionMode.Delete
                ? _deps.Retention.FindSubmittedBefore(cutoff)
                : _deps.Retention.FindIdentifiedSubmittedBefore(cutoff);
            Action<Guid> action = mode == RetentionMode.Delete
                ? (Action<Guid>)_deps.Retention.Delete
                : _deps.Retention.Anonymise;
            return BudgetedDeletion.Run(ids, action, budget, out isComplete);
        }

        private int RunInvitations(int days, RunBudget budget, out bool isComplete)
        {
            var effectiveDays = Math.Max(days, InvitationFloorDays);
            var cutoff = _deps.Pipeline.Clock.UtcNow.AddDays(-effectiveDays);
            return BudgetedDeletion.Run(_deps.InvitationRetention.FindGeneratedBefore(cutoff), _deps.InvitationRetention.Delete, budget, out isComplete);
        }

        private int RunSuppressionLogs(int days, RunBudget budget, out bool isComplete)
        {
            var effectiveDays = Math.Max(days, SuppressionLogFloorDays);
            var cutoff = _deps.Pipeline.Clock.UtcNow.AddDays(-effectiveDays);
            return BudgetedDeletion.Run(_deps.SuppressionLogRetention.FindCreatedBefore(cutoff), _deps.SuppressionLogRetention.Delete, budget, out isComplete);
        }

        private static RetentionResult Partial(int responses, int invitations, int suppressions, RetentionMode mode) =>
            new RetentionResult
            {
                Outcome = $"Retention: {responses} response(s) {Verb(mode)}, {invitations} invitation(s) deleted, {suppressions} suppression log(s) deleted. Time budget spent.",
                IsComplete = false,
            };

        private static string Verb(RetentionMode mode) => mode == RetentionMode.Delete ? "deleted" : "anonymised";
    }
}
