using System;
using System.Linq;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Services
{
    /// <summary>
    /// Turns one source-record change into invitations or suppression-log rows (section 6.3,
    /// B2 scope: steps 1, 2, 3, 5 and 8). Every firing trigger ends in exactly one of the two,
    /// so nothing is dropped silently (NFR-CSE-001). Fatigue, priority and milestones are B3.
    /// </summary>
    public sealed class SurveyTriggerService
    {
        private readonly SurveyTriggerDependencies _deps;

        /// <summary>Creates the service; every dependency is required.</summary>
        public SurveyTriggerService(SurveyTriggerDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            if (_deps.Config == null || _deps.Records == null || _deps.Languages == null || _deps.RenderCache == null
                || _deps.Invitations == null || _deps.Suppressions == null || _deps.Clock == null || _deps.Trace == null)
                throw new ArgumentException("Every SurveyTriggerDependencies member is required.", nameof(dependencies));
        }

        /// <summary>Evaluates every active trigger of the change's source table.</summary>
        public void Handle(RecordChange change)
        {
            var source = _deps.Config.FindActiveSource(change.TableLogicalName);
            if (source == null)
            {
                _deps.Trace.Write($"{change.TableLogicalName} is not an active survey source; nothing to do.");
                return;
            }
            var current = _deps.Records.ReadCurrent(source, change);
            var firing = _deps.Config.GetActiveEventTriggers(source.Id).Where(t => TriggerMatcher.Matches(t, current)).ToList();
            _deps.Trace.Write($"{firing.Count} trigger(s) fire for {current.TableLogicalName} {current.RecordId:D} ({current.OldStatus ?? "-"} -> {current.NewStatus ?? "-"}).");
            if (firing.Count == 0) return;
            var settings = _deps.Config.GetSettings();
            foreach (var trigger in firing) Evaluate(new TriggerEvaluation(trigger, source, current), settings);
        }

        private void Evaluate(TriggerEvaluation evaluation, SurveySettings settings)
        {
            var setup = evaluation.Trigger.Setup;
            var change = evaluation.Change;
            if (!change.CustomerId.HasValue) { Suppress(evaluation, SuppressionReason.NoCustomer, $"The customer field {evaluation.Source.Fields.CustomerLookup} is empty."); return; }
            var delivery = ChannelResolver.Resolve(evaluation.Source, setup, change);
            if (delivery == DeliveryChoice.None) { Suppress(evaluation, SuppressionReason.ChannelNone, $"Delivery is None for origin '{change.Origin ?? "(empty)"}'."); return; }
            if (!ActiveWindow.IsOpen(setup, _deps.Clock.UtcNow)) { Suppress(evaluation, SuppressionReason.OutsideWindow, "Today is outside the setup's active window."); return; }
            var dedupeKey = DedupeKey.ForRecord(setup.Id, change.CustomerId.Value, change);
            if (_deps.Invitations.ExistsWithDedupeKey(dedupeKey)) { Suppress(evaluation, SuppressionReason.Duplicate, "An invitation for this event already exists."); return; }
            CreateInvitation(evaluation, new InvitationPlan(delivery, dedupeKey, ResolveLanguage(change.CustomerId.Value, settings)));
        }

        private void CreateInvitation(TriggerEvaluation evaluation, InvitationPlan plan)
        {
            var setup = evaluation.Trigger.Setup;
            var version = _deps.RenderCache.FindActivePublishedVersion(setup.FormCode, plan.LanguageCode);
            if (!version.HasValue) { Suppress(evaluation, SuppressionReason.FormNotPublished, $"Form {setup.FormCode} has no active published version in '{plan.LanguageCode}'."); return; }
            var draft = InvitationFactory.Build(evaluation, plan, new PinnedForm(version.Value, _deps.Clock.UtcNow));
            if (_deps.Invitations.TryCreate(draft)) { _deps.Trace.Write($"Invitation created: {draft.DedupeKey}."); return; }
            Suppress(evaluation, SuppressionReason.Duplicate, "A concurrent run created this invitation first.");
        }

        private string ResolveLanguage(Guid customerId, SurveySettings settings)
        {
            if (string.IsNullOrWhiteSpace(settings.LanguageField)) return settings.DefaultLanguage;
            return LanguageCode.Normalise(_deps.Languages.ReadLanguageValue(customerId, settings.LanguageField), settings.DefaultLanguage);
        }

        private void Suppress(TriggerEvaluation evaluation, SuppressionReason reason, string detail)
        {
            _deps.Suppressions.Write(new SuppressionEntry
            {
                Reason = reason,
                CustomerId = evaluation.Change.CustomerId,
                TriggerId = evaluation.Trigger.Id,
                SetupId = evaluation.Trigger.Setup.Id,
                SourceTable = evaluation.Change.TableLogicalName,
                SourceRecordId = evaluation.Change.RecordId,
                Detail = detail,
                LoggedOn = _deps.Clock.UtcNow,
            });
            _deps.Trace.Write($"Suppressed ({reason}): {detail}");
        }
    }
}
