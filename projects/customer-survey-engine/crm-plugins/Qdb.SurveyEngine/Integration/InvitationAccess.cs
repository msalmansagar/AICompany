using System;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>
    /// Opens an invitation for get and submit (FR-CSE-015, 050, 052, 053). A caller names the
    /// invitation and the customer it must belong to, or presents a link token; either way the
    /// invitation must be Pending and unexpired. Every refusal is a <see cref="SurveyApiException"/>.
    /// </summary>
    public sealed class InvitationAccess
    {
        private readonly IntegrationDependencies _deps;

        public InvitationAccess(IntegrationDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
        }

        /// <summary>The open invitation the request identifies.</summary>
        /// <exception cref="SurveyApiException">Bad request, unknown, not the caller's, expired, already submitted, or secure link disabled.</exception>
        public InvitationRecord Open(InvitationRequest request)
        {
            if (request == null) throw new SurveyApiException(SurveyApiException.BadRequest, "A request is required.");
            var invitation = request.HasToken ? FindByToken(request.Token) : FindForCustomer(request);
            EnsureOpen(invitation);
            return invitation;
        }

        /// <summary>The invitation a token unlocks, open or not; refuses only when the channel is disabled or the token is unknown.</summary>
        public InvitationRecord FindByToken(string token)
        {
            if (!_deps.Config.GetSettings().SecureLinkEnabled)
                throw new SurveyApiException(SurveyApiException.Forbidden, "Secure-link delivery is disabled in this org until its security review is signed off.");
            return _deps.Invitations.FindByTokenHash(LinkToken.Hash(token))
                ?? throw new SurveyApiException(SurveyApiException.NotFound, "No invitation matches this link.");
        }

        /// <summary>Refuses an invitation that is not Pending or has expired.</summary>
        public void EnsureOpen(InvitationRecord invitation)
        {
            if (invitation.Status == InvitationStatus.Submitted || invitation.TokenUsedOn.HasValue)
                throw new SurveyApiException(SurveyApiException.AlreadySubmitted, "This survey has already been submitted.");
            if (invitation.Status == InvitationStatus.Expired || (invitation.ExpiresOn.HasValue && invitation.ExpiresOn.Value <= _deps.Clock.UtcNow))
                throw new SurveyApiException(SurveyApiException.Expired, ExpiredDetail(invitation));
            // Postponed and Discarded invitations were never sent, so to the caller they do not exist.
            if (invitation.Status != InvitationStatus.Pending)
                throw new SurveyApiException(SurveyApiException.NotFound, "No open survey has this id.");
        }

        private InvitationRecord FindForCustomer(InvitationRequest request)
        {
            if (!request.InvitationId.HasValue || !request.CallerCustomerId.HasValue)
                throw new SurveyApiException(SurveyApiException.BadRequest, "Give InvitationId and CallerCustomerId, or a Token.");
            var invitation = _deps.Invitations.FindById(request.InvitationId.Value)
                ?? throw new SurveyApiException(SurveyApiException.NotFound, $"No survey invitation has id {request.InvitationId.Value:D}.");
            if (invitation.CustomerId != request.CallerCustomerId.Value)
                throw new SurveyApiException(SurveyApiException.Forbidden, "This survey invitation belongs to another customer.");
            return invitation;
        }

        private static string ExpiredDetail(InvitationRecord invitation) =>
            invitation.ExpiresOn.HasValue ? $"This survey closed on {invitation.ExpiresOn.Value:yyyy-MM-dd HH:mm} UTC." : "This survey has closed.";
    }
}
