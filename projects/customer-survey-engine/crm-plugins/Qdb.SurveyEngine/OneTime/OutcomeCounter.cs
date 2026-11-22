using System;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.OneTime
{
    /// <summary>
    /// Passes invitation creates and suppression-log writes through to the real stores and counts
    /// them, so a One-time send can report its totals without changing the shared pipeline.
    /// One instance per page.
    /// </summary>
    internal sealed class OutcomeCounter : IInvitationRepository, ISuppressionLog
    {
        private readonly IInvitationRepository _invitations;
        private readonly ISuppressionLog _suppressions;
        private int _invited;
        private int _postponed;
        private int _suppressed;

        public OutcomeCounter(IInvitationRepository invitations, ISuppressionLog suppressions)
        {
            _invitations = invitations ?? throw new ArgumentNullException(nameof(invitations));
            _suppressions = suppressions ?? throw new ArgumentNullException(nameof(suppressions));
        }

        /// <summary>The totals so far.</summary>
        public OneTimeCounts Counts => new OneTimeCounts { Invited = _invited, Postponed = _postponed, Suppressed = _suppressed };

        /// <summary>The shared pipeline with invitation creates and suppression writes going through this counter.</summary>
        public SurveyTriggerDependencies Around(SurveyTriggerDependencies shared) => new SurveyTriggerDependencies
        {
            Config = shared.Config, Records = shared.Records, Languages = shared.Languages, RenderCache = shared.RenderCache,
            Milestones = shared.Milestones, Invitations = this, Suppressions = this, Clock = shared.Clock, Trace = shared.Trace,
        };

        public bool ExistsWithDedupeKey(string dedupeKey) => _invitations.ExistsWithDedupeKey(dedupeKey);

        public bool HasSentInvitationSince(Guid customerId, DateTime sinceUtc) => _invitations.HasSentInvitationSince(customerId, sinceUtc);

        public int GetLastMilestoneIndex(Guid setupId, Guid customerId) => _invitations.GetLastMilestoneIndex(setupId, customerId);

        public bool TryCreate(InvitationDraft draft)
        {
            var isCreated = _invitations.TryCreate(draft);
            if (isCreated && draft.Status == InvitationStatus.Pending) _invited++;
            if (isCreated && draft.Status == InvitationStatus.Postponed) _postponed++;
            return isCreated;
        }

        public void Write(SuppressionEntry entry)
        {
            _suppressions.Write(entry);
            _suppressed++;
        }
    }
}
