using System;
using System.ServiceModel;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Qdb.SurveyEngine.Dispatch;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Sends the invitation as a CRM email activity (section 10.2, FR-CSE-049): from the configured
    /// queue, to the customer account, regarding the invitation. SendEmail with IssueSend = true
    /// marks it Pending Send, and the org's Email Router (on-prem) or server-side sync (cloud)
    /// delivers it; creating and issuing the activity is the engine's whole responsibility.
    /// </summary>
    public sealed class EmailSender : IEmailSender
    {
        private readonly IOrganizationService _service;
        private readonly CustomerLink _customer;

        public EmailSender(IOrganizationService service, CustomerLink customer)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _customer = customer ?? throw new ArgumentNullException(nameof(customer));
        }

        /// <inheritdoc />
        public ChannelOutcome Send(EmailMessage message)
        {
            try
            {
                var emailId = _service.Create(BuildEmail(message));
                _service.Execute(new SendEmailRequest { EmailId = emailId, IssueSend = true, TrackingToken = string.Empty });
                return ChannelOutcome.Sent();
            }
            catch (FaultException<OrganizationServiceFault> fault)
            {
                return ChannelOutcome.Failed(fault.Detail.Message);
            }
        }

        private Entity BuildEmail(EmailMessage message) => new Entity("email")
        {
            ["subject"] = message.Subject,
            ["description"] = message.HtmlBody,
            ["directioncode"] = true,
            ["regardingobjectid"] = new EntityReference("qdb_survey_invitation", message.InvitationId),
            ["from"] = new EntityCollection(new[] { Party(new EntityReference("queue", message.SenderQueueId)) }),
            ["to"] = new EntityCollection(new[] { Party(_customer.Reference(message.CustomerId)) }),
        };

        private static Entity Party(EntityReference party) => new Entity("activityparty") { ["partyid"] = party };
    }
}
