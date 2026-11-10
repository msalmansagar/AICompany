using System;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>
    /// qdb_srv_ValidateLinkToken (FR-CSE-054, section 8): the invitation a token unlocks, or why it
    /// does not. Unlike get and submit, a used, expired or unknown token is an answer, not an error.
    /// </summary>
    public sealed class LinkTokenValidator
    {
        private readonly InvitationAccess _access;

        public LinkTokenValidator(InvitationAccess access)
        {
            _access = access ?? throw new ArgumentNullException(nameof(access));
        }

        /// <summary>Valid with the invitation, or invalid with reason used / expired / unknown.</summary>
        /// <exception cref="SurveyApiException">No token given, or the secure-link channel is disabled.</exception>
        public TokenValidation Validate(string token)
        {
            if (string.IsNullOrWhiteSpace(token)) throw new SurveyApiException(SurveyApiException.BadRequest, "Token is required.");
            try
            {
                var invitation = _access.FindByToken(token);
                _access.EnsureOpen(invitation);
                return TokenValidation.ValidFor(invitation);
            }
            catch (SurveyApiException refusal) when (refusal.Code != SurveyApiException.Forbidden)
            {
                return TokenValidation.Invalid(ReasonFor(refusal.Code));
            }
        }

        private static string ReasonFor(string code)
        {
            if (code == SurveyApiException.AlreadySubmitted) return "used";
            if (code == SurveyApiException.Expired) return "expired";
            return "unknown";
        }
    }

    /// <summary>The answer of <see cref="LinkTokenValidator.Validate"/>.</summary>
    public sealed class TokenValidation
    {
        private TokenValidation(InvitationRecord invitation, string reason)
        {
            Invitation = invitation;
            Reason = reason;
        }

        public bool IsValid => Invitation != null;

        /// <summary>The unlocked invitation; null when invalid.</summary>
        public InvitationRecord Invitation { get; }

        /// <summary>used, expired or unknown; null when valid.</summary>
        public string Reason { get; }

        public static TokenValidation ValidFor(InvitationRecord invitation) => new TokenValidation(invitation ?? throw new ArgumentNullException(nameof(invitation)), null);

        public static TokenValidation Invalid(string reason) => new TokenValidation(null, reason);
    }
}
