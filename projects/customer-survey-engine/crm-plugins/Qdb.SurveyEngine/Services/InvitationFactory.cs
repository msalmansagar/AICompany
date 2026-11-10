using System;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Services
{
    /// <summary>One trigger being evaluated against one record change.</summary>
    public sealed class TriggerEvaluation
    {
        public TriggerEvaluation(SurveyTrigger trigger, SurveySource source, RecordChange change)
        {
            Trigger = trigger;
            Source = source;
            Change = change;
        }

        public SurveyTrigger Trigger { get; }
        public SurveySource Source { get; }
        public RecordChange Change { get; }
    }

    /// <summary>The decisions already made for an invitation before its form version is pinned.</summary>
    public sealed class InvitationPlan
    {
        public DeliveryChoice Delivery { get; set; }
        public string DedupeKey { get; set; }
        public string LanguageCode { get; set; }

        /// <summary>Set for a milestone trigger: the index this invitation fulfils.</summary>
        public int? MilestoneIndex { get; set; }
    }

    /// <summary>A trigger that passed every per-trigger check and could send, pending fatigue and priority.</summary>
    public sealed class InvitationCandidate
    {
        public InvitationCandidate(TriggerEvaluation evaluation, InvitationPlan plan, int pinnedVersion)
        {
            Evaluation = evaluation;
            Plan = plan;
            PinnedVersion = pinnedVersion;
        }

        public TriggerEvaluation Evaluation { get; }
        public InvitationPlan Plan { get; }
        public int PinnedVersion { get; }
    }

    /// <summary>Builds the invitation row from a candidate.</summary>
    public static class InvitationFactory
    {
        /// <summary>Delivery must already be Portal or SecureLink; None never reaches here.</summary>
        public static InvitationDraft Build(InvitationCandidate candidate, InvitationStatus status, DateTime generatedOnUtc)
        {
            var setup = candidate.Evaluation.Trigger.Setup;
            var change = candidate.Evaluation.Change;
            return new InvitationDraft
            {
                Name = $"{setup.FormCode} — {change.TableLogicalName} {change.RecordId:D}",
                CustomerId = change.CustomerId.Value,
                SetupId = setup.Id,
                TriggerId = candidate.Evaluation.Trigger.Id,
                SourceTable = change.TableLogicalName,
                SourceRecordId = change.RecordId,
                FormCode = setup.FormCode,
                PinnedVersion = candidate.PinnedVersion,
                LanguageCode = candidate.Plan.LanguageCode,
                Status = status,
                Channel = candidate.Plan.Delivery == DeliveryChoice.SecureLink ? InvitationChannel.SecureLink : InvitationChannel.Portal,
                GeneratedOn = generatedOnUtc,
                ExpiresOn = setup.ExpiryDays.HasValue ? generatedOnUtc.AddDays(setup.ExpiryDays.Value) : (DateTime?)null,
                DedupeKey = candidate.Plan.DedupeKey,
                MilestoneIndex = candidate.Plan.MilestoneIndex,
            };
        }
    }
}
