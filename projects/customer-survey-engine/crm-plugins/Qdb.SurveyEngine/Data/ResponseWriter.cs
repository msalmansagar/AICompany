using System;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Integration;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Creates qdb_survey_response and its qdb_survey_answer rows (section 4.5, 4.6).</summary>
    public sealed class ResponseWriter : IResponseWriter
    {
        // "A record with matching key values already exists" (qdb_response_invitation) and the generic duplicate code.
        private const int DuplicateAlternateKeyError = unchecked((int)0x80060892);
        private const int DuplicateRecordError = unchecked((int)0x80040237);
        private readonly IOrganizationService _service;

        public ResponseWriter(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public ResponseCreation Create(ResponseDraft draft)
        {
            Guid responseId;
            try
            {
                responseId = _service.Create(ToResponse(draft));
            }
            catch (FaultException<OrganizationServiceFault> fault) when (fault.Detail.ErrorCode == DuplicateAlternateKeyError || fault.Detail.ErrorCode == DuplicateRecordError)
            {
                return ResponseCreation.Duplicate();
            }
            foreach (var answer in draft.Answers) _service.Create(ToAnswer(responseId, answer));
            return ResponseCreation.Created(responseId);
        }

        // The name carries no personal data, so views and the retention pass never have to clear it.
        private static Entity ToResponse(ResponseDraft draft)
        {
            var invitation = draft.Invitation;
            var response = new Entity("qdb_survey_response")
            {
                ["qdb_name"] = InvitationRepository.Truncate($"{invitation.FormCode} v{invitation.PinnedVersion} — {draft.SubmittedOn:yyyy-MM-dd HH:mm}", 200),
                ["qdb_survey_invitation_id"] = new EntityReference("qdb_survey_invitation", invitation.Id),
                ["qdb_survey_setup_id"] = new EntityReference("qdb_survey_setup", invitation.SetupId),
                ["qdb_customer_id"] = new EntityReference("account", invitation.CustomerId),
                ["qdb_source_table"] = invitation.SourceTable,
                ["qdb_source_record_id"] = invitation.SourceRecordId,
                ["qdb_form_code"] = invitation.FormCode,
                ["qdb_pinned_version"] = invitation.PinnedVersion,
                ["qdb_language_code"] = invitation.LanguageCode,
                ["qdb_answers_json"] = draft.AnswersJson,
                ["qdb_submitted_on"] = draft.SubmittedOn,
            };
            // Only a weighted survey names the score columns, so a normal survey works on an org that never got them.
            if (draft.Score != null)
            {
                response["qdb_score_total"] = draft.Score.Total;
                response["qdb_score_max"] = draft.Score.Maximum;
                response["qdb_score_percent"] = draft.Score.Percent;
            }
            return response;
        }

        private static Entity ToAnswer(Guid responseId, AnswerRow answer)
        {
            var row = new Entity("qdb_survey_answer")
            {
                ["qdb_name"] = InvitationRepository.Truncate(answer.QuestionLabel ?? answer.QuestionCode, 200),
                ["qdb_survey_response_id"] = new EntityReference("qdb_survey_response", responseId),
                ["qdb_question_code"] = answer.QuestionCode,
                ["qdb_question_label"] = InvitationRepository.Truncate(answer.QuestionLabel, 400),
                ["qdb_answer_text"] = InvitationRepository.Truncate(answer.AnswerText, 4000),
                ["qdb_answer_numeric"] = answer.AnswerNumeric,
                ["qdb_question_order"] = answer.QuestionOrder,
            };
            if (answer.Score == null) return row;
            row["qdb_points"] = answer.Score.Points;
            row["qdb_weighted_points"] = answer.Score.WeightedPoints;
            return row;
        }
    }
}
