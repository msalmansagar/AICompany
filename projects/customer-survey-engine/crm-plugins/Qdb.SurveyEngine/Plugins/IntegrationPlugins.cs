using Qdb.SurveyEngine.Integration;

namespace Qdb.SurveyEngine.Plugins
{
    /// <summary>qdb_srv_ListPendingSurveys (A2, section 9.2, FR-CSE-051, 047): CustomerId, Language? → SurveysJson.</summary>
    public sealed class ListPendingSurveysPlugin : IntegrationPluginBase
    {
        protected override void Run(PluginCall call)
        {
            var customerId = call.OptionalGuid("CustomerId") ?? throw new SurveyApiException(SurveyApiException.BadRequest, "CustomerId is required.");
            call.Output("SurveysJson", JsonText.Write(new PendingSurveyLister(call.Dependencies).List(customerId, call.Text("Language"))));
        }
    }

    /// <summary>qdb_srv_GetSurvey (A2, section 9.3, FR-CSE-052): InvitationId + CallerCustomerId, or Token; Language? → FormCode, Version, RenderedLanguage, RuntimeJson.</summary>
    public sealed class GetSurveyPlugin : IntegrationPluginBase
    {
        protected override void Run(PluginCall call)
        {
            var survey = new SurveyReader(call.Dependencies, new InvitationAccess(call.Dependencies)).Read(call.InvitationRequest(), call.Text("Language"));
            call.Output("FormCode", survey.Invitation.FormCode);
            call.Output("Version", survey.Invitation.PinnedVersion);
            call.Output("RenderedLanguage", survey.Language);
            call.Output("RuntimeJson", survey.RuntimeJson);
        }
    }

    /// <summary>qdb_srv_SubmitResponse (A2, section 9.4, FR-CSE-053, 056): InvitationId + CallerCustomerId, or Token; AnswersJson → ResponseId, Status.</summary>
    public sealed class SubmitResponsePlugin : IntegrationPluginBase
    {
        protected override void Run(PluginCall call)
        {
            var responseId = new ResponseSubmitter(call.Dependencies, new InvitationAccess(call.Dependencies)).Submit(call.InvitationRequest(), call.Text("AnswersJson"));
            call.Output("ResponseId", responseId.ToString("D"));
            call.Output("Status", "submitted");
        }
    }

    /// <summary>qdb_srv_ValidateLinkToken (A2, section 9.5, FR-CSE-054, 050): Token → Valid, Reason, InvitationId, SetupId, FormCode, Language.</summary>
    public sealed class ValidateLinkTokenPlugin : IntegrationPluginBase
    {
        protected override void Run(PluginCall call)
        {
            var result = new LinkTokenValidator(new InvitationAccess(call.Dependencies)).Validate(call.Text("Token"));
            call.Output("Valid", result.IsValid);
            call.Output("Reason", result.Reason ?? string.Empty);
            call.Output("InvitationId", result.Invitation?.Id.ToString("D") ?? string.Empty);
            call.Output("SetupId", result.Invitation?.SetupId.ToString("D") ?? string.Empty);
            call.Output("FormCode", result.Invitation?.FormCode ?? string.Empty);
            call.Output("Language", result.Invitation?.LanguageCode ?? string.Empty);
        }
    }
}
