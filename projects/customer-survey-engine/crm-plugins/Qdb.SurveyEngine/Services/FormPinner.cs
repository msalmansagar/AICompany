using System;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Services
{
    /// <summary>
    /// Picks the customer's language and pins the form version published in it (FR-CSE-008, 013).
    /// Shared by record-driven and scheduled triggers; a form with no published version in that
    /// language is logged and yields no candidate.
    /// </summary>
    public sealed class FormPinner
    {
        private readonly SurveyTriggerDependencies _deps;
        private readonly SuppressionRecorder _suppressions;

        public FormPinner(SurveyTriggerDependencies dependencies, SuppressionRecorder suppressions)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            _suppressions = suppressions ?? throw new ArgumentNullException(nameof(suppressions));
        }

        /// <summary>The candidate with its pinned form version, or null when the form is not published in the customer's language.</summary>
        public InvitationCandidate Pin(TriggerEvaluation evaluation, InvitationPlanRequest request)
        {
            var language = ResolveLanguage(evaluation.Change.CustomerId.Value, request.Settings);
            var formCode = evaluation.Trigger.Setup.FormCode;
            var version = _deps.RenderCache.FindActivePublishedVersion(formCode, language);
            if (!version.HasValue)
            {
                _suppressions.Record(evaluation, SuppressionReason.FormNotPublished, $"Form {formCode} has no active published version in '{language}'.");
                return null;
            }
            return new InvitationCandidate(evaluation, new InvitationPlan(request.Delivery, request.Key, language), version.Value);
        }

        private string ResolveLanguage(Guid customerId, SurveySettings settings)
        {
            if (string.IsNullOrWhiteSpace(settings.LanguageField)) return settings.DefaultLanguage;
            return LanguageCode.Normalise(_deps.Languages.ReadLanguageValue(customerId, settings.LanguageField), settings.DefaultLanguage);
        }
    }

    /// <summary>What <see cref="FormPinner"/> needs besides the evaluation.</summary>
    public sealed class InvitationPlanRequest
    {
        public DeliveryChoice Delivery { get; set; }
        public InvitationKey Key { get; set; }
        public SurveySettings Settings { get; set; }
    }
}
