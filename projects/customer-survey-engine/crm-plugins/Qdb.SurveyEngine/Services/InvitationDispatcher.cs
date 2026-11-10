using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Services
{
    /// <summary>
    /// Applies the customer-level rules to the candidates of one record change (section 6.3 steps
    /// 6–8): fatigue first, then priority. The winner is sent; every other candidate follows its
    /// trigger's Drop / Postpone setting (FR-CSE-040..043).
    /// </summary>
    public sealed class InvitationDispatcher
    {
        private readonly SurveyTriggerDependencies _deps;
        private readonly SuppressionRecorder _suppressions;

        public InvitationDispatcher(SurveyTriggerDependencies dependencies, SuppressionRecorder suppressions)
        {
            _deps = dependencies ?? throw new System.ArgumentNullException(nameof(dependencies));
            _suppressions = suppressions ?? throw new System.ArgumentNullException(nameof(suppressions));
        }

        /// <summary>All candidates belong to the same customer (one record change).</summary>
        public void Dispatch(IReadOnlyList<InvitationCandidate> candidates, SurveySettings settings)
        {
            if (candidates.Count == 0) return;
            if (IsCustomerFatigued(candidates[0].Evaluation.Change.CustomerId.Value, settings))
            {
                foreach (var candidate in candidates) Block(candidate, SuppressionReason.Fatigue, $"The customer already has an invitation within {settings.FatigueMinDays} days.");
                return;
            }
            var ordered = candidates.OrderBy(c => c, Comparer<InvitationCandidate>.Create((a, b) => PriorityRule.Compare(a.Evaluation.Trigger, b.Evaluation.Trigger))).ToList();
            Create(ordered[0], InvitationStatus.Pending);
            foreach (var loser in ordered.Skip(1)) Block(loser, SuppressionReason.PriorityLost, $"Trigger {ordered[0].Evaluation.Trigger.Id:D} has a higher priority.");
        }

        private bool IsCustomerFatigued(System.Guid customerId, SurveySettings settings)
        {
            var since = FatiguePolicy.BlockingSince(settings, _deps.Clock.UtcNow);
            return since.HasValue && _deps.Invitations.HasSentInvitationSince(customerId, since.Value);
        }

        // Postpone queues the invitation for the daily job (B5) instead of losing it.
        private void Block(InvitationCandidate candidate, SuppressionReason reason, string detail)
        {
            if (FatiguePolicy.ActionFor(candidate.Evaluation.Trigger) == FatigueAction.Postpone)
            {
                Create(candidate, InvitationStatus.Postponed);
                return;
            }
            _suppressions.Record(candidate.Evaluation, reason, detail);
        }

        private void Create(InvitationCandidate candidate, InvitationStatus status)
        {
            var draft = InvitationFactory.Build(candidate, status, _deps.Clock.UtcNow);
            if (_deps.Invitations.TryCreate(draft)) { _deps.Trace.Write($"Invitation created ({status}): {draft.DedupeKey}."); return; }
            _suppressions.Record(candidate.Evaluation, SuppressionReason.Duplicate, "A concurrent run created this invitation first.");
        }
    }
}
