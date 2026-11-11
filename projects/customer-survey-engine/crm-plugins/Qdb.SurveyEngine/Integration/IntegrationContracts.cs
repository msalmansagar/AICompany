using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>One invitation as the integration APIs need it.</summary>
    public sealed class InvitationRecord
    {
        public Guid Id { get; set; }
        public Guid CustomerId { get; set; }
        public Guid SetupId { get; set; }
        public string FormCode { get; set; }
        public int PinnedVersion { get; set; }
        public string LanguageCode { get; set; }
        public InvitationStatus Status { get; set; }
        public InvitationChannel? Channel { get; set; }
        public DateTime? ExpiresOn { get; set; }
        public DateTime? TokenUsedOn { get; set; }
        public string SourceTable { get; set; }
        public string SourceRecordId { get; set; }

        /// <summary>The row version read with the invitation; closing it fails if anyone changed it since.</summary>
        public string RowVersion { get; set; }
    }

    /// <summary>A Pending invitation with its setup's bilingual wording, for the pending-surveys list.</summary>
    public sealed class PendingInvitation
    {
        public InvitationRecord Invitation { get; set; }
        public string TitleEnglish { get; set; }
        public string TitleArabic { get; set; }
        public string MessageEnglish { get; set; }
        public string MessageArabic { get; set; }
    }

    /// <summary>Reads invitations and closes them on submit.</summary>
    public interface IIntegrationInvitationStore
    {
        /// <summary>The invitation, or null when no invitation has this id.</summary>
        InvitationRecord FindById(Guid invitationId);

        /// <summary>The invitation holding this token hash, or null.</summary>
        InvitationRecord FindByTokenHash(string tokenHash);

        /// <summary>The customer's Pending invitations that have not expired at <paramref name="nowUtc"/>, oldest first.</summary>
        IReadOnlyList<PendingInvitation> ListOpen(Guid customerId, DateTime nowUtc);

        /// <summary>Pending → Submitted (and the token marked used when one opened it); false when the row changed since it was read.</summary>
        bool TryClose(InvitationClosure closure);
    }

    /// <summary>What closing an invitation writes.</summary>
    public sealed class InvitationClosure
    {
        public InvitationRecord Invitation { get; set; }
        public DateTime SubmittedOn { get; set; }
        public bool WasOpenedByToken { get; set; }
    }

    /// <summary>Reads a published survey form from the DFE render cache.</summary>
    public interface IPublishedFormReader
    {
        /// <summary>The runtime JSON of that exact version and language, or null when it is not in the cache.</summary>
        string FindRuntimeJson(string formCode, int version, string languageCode);
    }

    /// <summary>Writes one response with its answers.</summary>
    public interface IResponseWriter
    {
        /// <summary>Creates the response and its answers, unless the invitation already has a response (alternate key).</summary>
        ResponseCreation Create(ResponseDraft draft);
    }

    /// <summary>The outcome of <see cref="IResponseWriter.Create"/>.</summary>
    public sealed class ResponseCreation
    {
        private ResponseCreation(Guid responseId, bool isDuplicate)
        {
            ResponseId = responseId;
            IsDuplicate = isDuplicate;
        }

        public Guid ResponseId { get; }

        /// <summary>True when another response for the invitation already existed, so nothing was written.</summary>
        public bool IsDuplicate { get; }

        public static ResponseCreation Created(Guid responseId) => new ResponseCreation(responseId, false);

        public static ResponseCreation Duplicate() => new ResponseCreation(Guid.Empty, true);
    }

    /// <summary>A response ready to be written (section 4.5, 4.6).</summary>
    public sealed class ResponseDraft
    {
        public InvitationRecord Invitation { get; set; }
        public string AnswersJson { get; set; }
        public DateTime SubmittedOn { get; set; }
        public IReadOnlyList<AnswerRow> Answers { get; set; }

        /// <summary>Set for a weighted survey only; a normal survey stores no score (FR-CSE-061).</summary>
        public ResponseScore Score { get; set; }
    }

    /// <summary>One answered question, normalised for views and charts (FR-CSE-056, 057).</summary>
    public sealed class AnswerRow
    {
        public string QuestionCode { get; set; }
        public string QuestionLabel { get; set; }
        public string AnswerText { get; set; }
        public decimal? AnswerNumeric { get; set; }
        public int QuestionOrder { get; set; }

        /// <summary>The answer's points on a weighted survey; null when the question is not scored.</summary>
        public AnswerScore Score { get; set; }
    }

    /// <summary>A weighted survey's response score (Addendum A, FR-CSE-066).</summary>
    public sealed class ResponseScore
    {
        public ResponseScore(decimal total, decimal maximum)
        {
            Total = total;
            Maximum = maximum;
        }

        public decimal Total { get; }
        public decimal Maximum { get; }

        /// <summary>Total ÷ maximum × 100, two decimals; null when nothing scorable was answered.</summary>
        public decimal? Percent => Maximum > 0 ? Math.Round(Total / Maximum * 100m, 2) : (decimal?)null;

        /// <summary>The sum of the scored answers; skipped questions count towards neither total nor maximum (FR-CSE-068).</summary>
        public static ResponseScore Of(IEnumerable<AnswerRow> answers)
        {
            var scored = answers.Where(a => a.Score != null).ToList();
            return new ResponseScore(scored.Sum(a => a.Score.WeightedPoints), scored.Sum(a => a.Score.WeightedMaximum));
        }
    }

    /// <summary>All collaborators of the integration services.</summary>
    public sealed class IntegrationDependencies
    {
        public IIntegrationInvitationStore Invitations { get; set; }
        public IPublishedFormReader Forms { get; set; }
        public IResponseWriter Responses { get; set; }
        public ISurveyConfigRepository Config { get; set; }
        public IClock Clock { get; set; }
    }

    /// <summary>How a caller identifies the invitation: by id plus the customer it must belong to, or by a link token.</summary>
    public sealed class InvitationRequest
    {
        public Guid? InvitationId { get; set; }
        public Guid? CallerCustomerId { get; set; }
        public string Token { get; set; }

        public bool HasToken => !string.IsNullOrWhiteSpace(Token);
    }
}
