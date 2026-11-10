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
        public InvitationPlan(DeliveryChoice delivery, string dedupeKey, string languageCode)
        {
            Delivery = delivery;
            DedupeKey = dedupeKey;
            LanguageCode = languageCode;
        }

        public DeliveryChoice Delivery { get; }
        public string DedupeKey { get; }
        public string LanguageCode { get; }
    }

    /// <summary>The published form version pinned at generation time (FR-CSE-046).</summary>
    public sealed class PinnedForm
    {
        public PinnedForm(int version, DateTime generatedOnUtc)
        {
            Version = version;
            GeneratedOnUtc = generatedOnUtc;
        }

        public int Version { get; }
        public DateTime GeneratedOnUtc { get; }
    }

    /// <summary>Builds the invitation row from an evaluated trigger.</summary>
    public static class InvitationFactory
    {
        /// <summary>Delivery must already be Portal or SecureLink; None never reaches here.</summary>
        public static InvitationDraft Build(TriggerEvaluation evaluation, InvitationPlan plan, PinnedForm form)
        {
            var setup = evaluation.Trigger.Setup;
            var change = evaluation.Change;
            return new InvitationDraft
            {
                Name = $"{setup.FormCode} — {change.TableLogicalName} {change.RecordId:D}",
                CustomerId = change.CustomerId.Value,
                SetupId = setup.Id,
                TriggerId = evaluation.Trigger.Id,
                SourceTable = change.TableLogicalName,
                SourceRecordId = change.RecordId,
                FormCode = setup.FormCode,
                PinnedVersion = form.Version,
                LanguageCode = plan.LanguageCode,
                Status = InvitationStatus.Pending,
                Channel = plan.Delivery == DeliveryChoice.SecureLink ? InvitationChannel.SecureLink : InvitationChannel.Portal,
                GeneratedOn = form.GeneratedOnUtc,
                ExpiresOn = setup.ExpiryDays.HasValue ? form.GeneratedOnUtc.AddDays(setup.ExpiryDays.Value) : (DateTime?)null,
                DedupeKey = plan.DedupeKey,
            };
        }
    }
}
