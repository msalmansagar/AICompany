using System;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Scheduling
{
    /// <summary>
    /// Releases Postponed invitations once the customer's fatigue window has ended (FR-CSE-042).
    /// One that expired first, or whose setup was deactivated or left its active window, is
    /// discarded and logged, so nothing disappears silently (NFR-CSE-001). Oldest first, so the
    /// longest-waiting invitation is the one a customer receives.
    /// </summary>
    public sealed class PostponedReleasePass
    {
        private readonly RunDueSurveysDependencies _deps;

        public PostponedReleasePass(RunDueSurveysDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
        }

        /// <summary>Processes every Postponed invitation, or as many as the budget allows.</summary>
        public PostponedReleaseResult Run(RunBudget budget)
        {
            var result = new PostponedReleaseResult();
            var settings = _deps.Pipeline.Config.GetSettings();
            foreach (var invitation in _deps.Postponed.GetPostponed())
            {
                if (budget.IsExhausted) { result.IsComplete = false; break; }
                Process(invitation, settings, result);
            }
            _deps.Pipeline.Trace.Write(result.ToString());
            return result;
        }

        private void Process(PostponedInvitation invitation, SurveySettings settings, PostponedReleaseResult result)
        {
            var reason = FindDiscardReason(invitation);
            if (reason != null) { Discard(invitation, reason, result); return; }
            if (IsCustomerFatigued(invitation.CustomerId, settings)) { result.StillWaiting++; return; }
            if (_deps.Postponed.TryRelease(invitation, _deps.Pipeline.Clock.UtcNow)) result.Released++;
            else result.ChangedElsewhere++;
        }

        private DiscardReason FindDiscardReason(PostponedInvitation invitation)
        {
            var now = _deps.Pipeline.Clock.UtcNow;
            if (invitation.ExpiresOn.HasValue && invitation.ExpiresOn.Value <= now)
                return new DiscardReason(SuppressionReason.PostponedExpired, $"Expired on {invitation.ExpiresOn.Value:yyyy-MM-dd HH:mm} UTC before the customer's fatigue window ended.");
            if (!invitation.IsSetupActive) return new DiscardReason(SuppressionReason.Inactive, "The setup was deactivated before the invitation could be released.");
            if (!ActiveWindow.IsOpen(invitation.Setup, now)) return new DiscardReason(SuppressionReason.OutsideWindow, "The setup's active window ended before the invitation could be released.");
            return null;
        }

        private bool IsCustomerFatigued(Guid customerId, SurveySettings settings)
        {
            var since = FatiguePolicy.BlockingSince(settings, _deps.Pipeline.Clock.UtcNow);
            return since.HasValue && _deps.Pipeline.Invitations.HasSentInvitationSince(customerId, since.Value);
        }

        private void Discard(PostponedInvitation invitation, DiscardReason reason, PostponedReleaseResult result)
        {
            if (!_deps.Postponed.TryDiscard(invitation)) { result.ChangedElsewhere++; return; }
            _deps.Pipeline.Suppressions.Write(new SuppressionEntry
            {
                Reason = reason.Reason,
                CustomerId = invitation.CustomerId,
                TriggerId = invitation.TriggerId,
                SetupId = invitation.Setup.Id,
                SourceTable = invitation.SourceTable,
                SourceRecordId = invitation.SourceRecordId,
                Detail = $"Postponed invitation {invitation.Id:D} discarded: {reason.Detail}",
                LoggedOn = _deps.Pipeline.Clock.UtcNow,
            });
            result.Discarded++;
        }

        private sealed class DiscardReason
        {
            public DiscardReason(SuppressionReason reason, string detail)
            {
                Reason = reason;
                Detail = detail;
            }

            public SuppressionReason Reason { get; }
            public string Detail { get; }
        }
    }
}
