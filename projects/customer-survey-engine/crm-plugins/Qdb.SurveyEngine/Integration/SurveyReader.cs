using System;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>
    /// qdb_srv_GetSurvey (FR-CSE-052, AC16): the published JSON of the invitation's pinned form
    /// version, in the requested language when that version was published in it, else in the
    /// invitation's own language.
    /// </summary>
    public sealed class SurveyReader
    {
        private readonly IntegrationDependencies _deps;
        private readonly InvitationAccess _access;

        public SurveyReader(IntegrationDependencies dependencies, InvitationAccess access)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            _access = access ?? throw new ArgumentNullException(nameof(access));
        }

        /// <summary>The survey to render.</summary>
        /// <exception cref="SurveyApiException">Any access refusal, or the pinned version is no longer in the render cache.</exception>
        public PublishedSurvey Read(InvitationRequest request, string language)
        {
            var invitation = _access.Open(request);
            var requested = string.IsNullOrWhiteSpace(language) ? invitation.LanguageCode : SurveyLanguage.Normalise(language, invitation.LanguageCode);
            var json = _deps.Forms.FindRuntimeJson(invitation.FormCode, invitation.PinnedVersion, requested);
            if (json != null) return new PublishedSurvey(invitation, requested, json);
            json = _deps.Forms.FindRuntimeJson(invitation.FormCode, invitation.PinnedVersion, invitation.LanguageCode)
                ?? throw new SurveyApiException(SurveyApiException.NotFound, $"Form {invitation.FormCode} version {invitation.PinnedVersion} is no longer in the render cache.");
            return new PublishedSurvey(invitation, invitation.LanguageCode, json);
        }
    }

    /// <summary>The answer of <see cref="SurveyReader.Read"/>.</summary>
    public sealed class PublishedSurvey
    {
        public PublishedSurvey(InvitationRecord invitation, string language, string runtimeJson)
        {
            Invitation = invitation ?? throw new ArgumentNullException(nameof(invitation));
            Language = language;
            RuntimeJson = runtimeJson ?? throw new ArgumentNullException(nameof(runtimeJson));
        }

        public InvitationRecord Invitation { get; }
        public string Language { get; }
        public string RuntimeJson { get; }
    }
}
