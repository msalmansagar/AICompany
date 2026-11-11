using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Serialization;

namespace Qdb.SurveyEngine.Integration
{
    /// <summary>
    /// qdb_srv_SubmitResponse (FR-CSE-053, 056): validates the invitation, writes one Response with
    /// the answers JSON and one Answer per answered question, then closes the invitation. It never
    /// writes to a mapped CRM entity. The Custom API runs in one transaction, so a refusal part-way
    /// leaves nothing behind; the response alternate key makes a concurrent second submit fail.
    /// </summary>
    public sealed class ResponseSubmitter
    {
        private readonly IntegrationDependencies _deps;
        private readonly InvitationAccess _access;

        public ResponseSubmitter(IntegrationDependencies dependencies, InvitationAccess access)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            _access = access ?? throw new ArgumentNullException(nameof(access));
        }

        /// <summary>The new response's id.</summary>
        /// <exception cref="SurveyApiException">Access refused, invalid or unknown answers, or already submitted.</exception>
        public Guid Submit(InvitationRequest request, string answersJson)
        {
            var invitation = _access.Open(request);
            var answers = ReadAnswers(answersJson);
            var questions = LoadQuestions(invitation);
            var now = _deps.Clock.UtcNow;
            var rows = ToRows(answers, questions);
            var created = _deps.Responses.Create(new ResponseDraft
            {
                Invitation = invitation, AnswersJson = answersJson, SubmittedOn = now, Answers = rows,
                Score = questions.IsWeighted ? ResponseScore.Of(rows) : null,
            });
            if (created.IsDuplicate) throw new SurveyApiException(SurveyApiException.AlreadySubmitted, "This survey has already been submitted.");
            Close(invitation, new InvitationClosure { Invitation = invitation, SubmittedOn = now, WasOpenedByToken = request.HasToken });
            return created.ResponseId;
        }

        // A row-version mismatch may be another submit, or only an unrelated edit (an admin moving the
        // expiry). Re-reading tells them apart, so the caller gets the true reason, and an invitation
        // that is still open is closed against its fresh version.
        private void Close(InvitationRecord invitation, InvitationClosure closure)
        {
            if (_deps.Invitations.TryClose(closure)) return;
            var current = _deps.Invitations.FindById(invitation.Id) ?? throw new SurveyApiException(SurveyApiException.NotFound, "The survey invitation no longer exists.");
            _access.EnsureOpen(current);
            if (!_deps.Invitations.TryClose(new InvitationClosure { Invitation = current, SubmittedOn = closure.SubmittedOn, WasOpenedByToken = closure.WasOpenedByToken }))
                throw new SurveyApiException(SurveyApiException.AlreadySubmitted, "This survey was changed while it was being submitted; it has been submitted elsewhere.");
        }

        private static IReadOnlyList<SubmittedAnswer> ReadAnswers(string answersJson)
        {
            if (string.IsNullOrWhiteSpace(answersJson)) throw new SurveyApiException(SurveyApiException.BadRequest, "AnswersJson is required.");
            var answers = JsonText.Read<List<SubmittedAnswer>>(answersJson, "AnswersJson");
            if (answers == null || answers.Any(a => string.IsNullOrWhiteSpace(a.QuestionCode)))
                throw new SurveyApiException(SurveyApiException.BadRequest, "AnswersJson must be an array of { questionCode, value }.");
            return answers;
        }

        private SurveyQuestions LoadQuestions(InvitationRecord invitation)
        {
            var json = _deps.Forms.FindRuntimeJson(invitation.FormCode, invitation.PinnedVersion, invitation.LanguageCode)
                ?? throw new SurveyApiException(SurveyApiException.NotFound, $"Form {invitation.FormCode} version {invitation.PinnedVersion} is no longer in the render cache.");
            return SurveyQuestions.FromRuntimeJson(json);
        }

        // An answer to a question the pinned form does not have is refused rather than stored unlabelled.
        private static IReadOnlyList<AnswerRow> ToRows(IReadOnlyList<SubmittedAnswer> answers, SurveyQuestions questions)
        {
            var unknown = answers.Where(a => questions.Find(a.QuestionCode) == null).Select(a => a.QuestionCode).ToList();
            if (unknown.Count > 0) throw new SurveyApiException(SurveyApiException.BadRequest, "Unknown question code(s): " + string.Join(", ", unknown) + ".");
            return answers.Where(a => !string.IsNullOrEmpty(a.Value)).Select(a => questions.Find(a.QuestionCode).Answer(a.Value)).OrderBy(r => r.QuestionOrder).ToList();
        }
    }

    /// <summary>One element of AnswersJson: the DFE field schema name and the value as text (several option values comma-separated).</summary>
    [DataContract]
    public sealed class SubmittedAnswer
    {
        [DataMember(Name = "questionCode")] public string QuestionCode { get; set; }
        [DataMember(Name = "value")] public string Value { get; set; }
    }
}
