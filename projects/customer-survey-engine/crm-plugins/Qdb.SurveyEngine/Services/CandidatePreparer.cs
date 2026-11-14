using System;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Services
{
    /// <summary>
    /// Runs the per-trigger checks of section 6.3 (customer, channel, window, milestone, duplicate,
    /// published form). A trigger that fails one is logged and yields no candidate.
    /// </summary>
    public sealed class CandidatePreparer
    {
        private readonly SurveyTriggerDependencies _deps;
        private readonly SuppressionRecorder _suppressions;
        private readonly FormPinner _pinner;

        public CandidatePreparer(SurveyTriggerDependencies dependencies, SuppressionRecorder suppressions, FormPinner pinner)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            _suppressions = suppressions ?? throw new ArgumentNullException(nameof(suppressions));
            _pinner = pinner ?? throw new ArgumentNullException(nameof(pinner));
        }

        /// <summary>The candidate, or null when the trigger was suppressed or no milestone was reached.</summary>
        public InvitationCandidate Prepare(TriggerEvaluation evaluation, SurveySettings settings)
        {
            var change = evaluation.Change;
            var setup = evaluation.Trigger.Setup;
            if (!change.CustomerId.HasValue) return Suppressed(evaluation, SuppressionReason.NoCustomer, $"The customer field {evaluation.Source.Fields.CustomerLookup} is empty.");
            var delivery = ChannelResolver.Resolve(evaluation.Source, setup, change);
            if (delivery == DeliveryChoice.None) return Suppressed(evaluation, SuppressionReason.ChannelNone, $"Delivery is None for origin '{change.Origin ?? "(empty)"}'.");
            if (!ActiveWindow.IsOpen(setup, _deps.Clock.UtcNow)) return Suppressed(evaluation, SuppressionReason.OutsideWindow, "Today is outside the setup's active window.");
            var key = FindInvitationKey(evaluation);
            if (key == null) return null;
            if (_deps.Invitations.ExistsWithDedupeKey(key.DedupeKey)) return Suppressed(evaluation, SuppressionReason.Duplicate, "An invitation for this event already exists.");
            return _pinner.Pin(evaluation, new InvitationPlanRequest { Delivery = delivery, Key = key, Settings = settings });
        }

        // Event/created triggers key on the record; milestone triggers on the index reached, or nothing when none was.
        private InvitationKey FindInvitationKey(TriggerEvaluation evaluation)
        {
            var setupId = evaluation.Trigger.Setup.Id;
            var customerId = evaluation.Change.CustomerId.Value;
            if (evaluation.Trigger.Kind != TriggerKind.Milestone) return new InvitationKey(DedupeKey.ForRecord(setupId, customerId, evaluation.Change), (int?)null);
            var index = FindMilestoneIndex(evaluation);
            return index.HasValue ? new InvitationKey(DedupeKey.ForMilestone(setupId, customerId, index.Value), index) : null;
        }

        private int? FindMilestoneIndex(TriggerEvaluation evaluation)
        {
            if (!evaluation.Source.CountsTowardMilestonesOrTrace(_deps.Trace)) return null;
            var counts = CountMilestone(evaluation);
            var index = MilestoneRule.IndexToFire(evaluation.Trigger.Milestone, counts);
            _deps.Trace.Write($"Milestone: {counts.Qualifying} qualifying, {counts.QualifyingBeforeActivation} before activation, last index {counts.LastFiredIndex}, fire {(index.HasValue ? index.Value.ToString() : "none")}.");
            return index;
        }

        private MilestoneCounts CountMilestone(TriggerEvaluation evaluation)
        {
            var trigger = evaluation.Trigger;
            var query = new MilestoneCountQuery { Source = evaluation.Source, Settings = trigger.Milestone, CustomerId = evaluation.Change.CustomerId.Value };
            var activation = trigger.Setup.ActiveFrom ?? trigger.CreatedOn;
            return new MilestoneCounts
            {
                Qualifying = _deps.Milestones.CountQualifying(query),
                QualifyingBeforeActivation = trigger.Milestone.SkipReached ? _deps.Milestones.CountQualifying(WithCreatedBefore(query, activation)) : 0,
                LastFiredIndex = _deps.Invitations.GetLastMilestoneIndex(trigger.Setup.Id, query.CustomerId),
            };
        }

        private static MilestoneCountQuery WithCreatedBefore(MilestoneCountQuery query, DateTime before) =>
            new MilestoneCountQuery { Source = query.Source, Settings = query.Settings, CustomerId = query.CustomerId, CreatedBefore = before };

        private InvitationCandidate Suppressed(TriggerEvaluation evaluation, SuppressionReason reason, string detail)
        {
            _suppressions.Record(evaluation, reason, detail);
            return null;
        }
    }

    internal static class SourceMilestoneExtensions
    {
        // A milestone trigger on a source that does not count (Fund Transfers) never fires (FR-CSE-035).
        public static bool CountsTowardMilestonesOrTrace(this SurveySource source, ITrace trace)
        {
            if (source.Fields.CountsTowardMilestones) return true;
            trace.Write($"{source.TableLogicalName} does not count toward milestones; milestone trigger ignored.");
            return false;
        }
    }
}
