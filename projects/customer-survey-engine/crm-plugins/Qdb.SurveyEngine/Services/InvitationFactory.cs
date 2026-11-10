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

    /// <summary>What makes an invitation unique: its dedupe key and, for a milestone, the index; for a schedule, the period.</summary>
    public sealed class InvitationKey
    {
        public InvitationKey(string dedupeKey, int? milestoneIndex)
        {
            DedupeKey = dedupeKey ?? throw new ArgumentNullException(nameof(dedupeKey));
            MilestoneIndex = milestoneIndex;
        }

        /// <summary>A scheduled invitation's key: unique per setup, customer and calendar period.</summary>
        public InvitationKey(string dedupeKey, ScheduledSlot slot)
        {
            DedupeKey = dedupeKey ?? throw new ArgumentNullException(nameof(dedupeKey));
            Slot = slot ?? throw new ArgumentNullException(nameof(slot));
        }

        public string DedupeKey { get; }

        /// <summary>Set for a milestone trigger: the index this invitation fulfils.</summary>
        public int? MilestoneIndex { get; }

        /// <summary>Set for a scheduled trigger: the period surveyed and any fixed expiry.</summary>
        public ScheduledSlot Slot { get; }
    }

    /// <summary>The calendar period a scheduled invitation belongs to.</summary>
    public sealed class ScheduledSlot
    {
        public ScheduledSlot(string periodKey, DateTime? fixedExpiresOn)
        {
            PeriodKey = periodKey ?? throw new ArgumentNullException(nameof(periodKey));
            FixedExpiresOn = fixedExpiresOn;
        }

        public string PeriodKey { get; }

        /// <summary>Quarterly: one month into the next quarter (FR-CSE-016); null = the setup's expiry days.</summary>
        public DateTime? FixedExpiresOn { get; }
    }

    /// <summary>The decisions already made for an invitation before its form version is pinned.</summary>
    public sealed class InvitationPlan
    {
        public InvitationPlan(DeliveryChoice delivery, InvitationKey key, string languageCode)
        {
            Delivery = delivery;
            Key = key ?? throw new ArgumentNullException(nameof(key));
            LanguageCode = languageCode;
        }

        public DeliveryChoice Delivery { get; }
        public InvitationKey Key { get; }
        public string LanguageCode { get; }
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
            var slot = candidate.Plan.Key.Slot;
            return new InvitationDraft
            {
                Name = slot == null ? $"{setup.FormCode} — {change.TableLogicalName} {change.RecordId:D}" : $"{setup.FormCode} — {slot.PeriodKey}",
                CustomerId = change.CustomerId.Value,
                SetupId = setup.Id,
                TriggerId = candidate.Evaluation.Trigger.Id,
                SourceTable = change.TableLogicalName,
                SourceRecordId = change.SourceRecordId,
                FormCode = setup.FormCode,
                PinnedVersion = candidate.PinnedVersion,
                LanguageCode = candidate.Plan.LanguageCode,
                Status = status,
                Channel = candidate.Plan.Delivery == DeliveryChoice.SecureLink ? InvitationChannel.SecureLink : InvitationChannel.Portal,
                GeneratedOn = generatedOnUtc,
                ExpiresOn = slot?.FixedExpiresOn ?? (setup.ExpiryDays.HasValue ? generatedOnUtc.AddDays(setup.ExpiryDays.Value) : (DateTime?)null),
                DedupeKey = candidate.Plan.Key.DedupeKey,
                MilestoneIndex = candidate.Plan.Key.MilestoneIndex,
                SchedulePeriodKey = slot?.PeriodKey,
            };
        }
    }
}
