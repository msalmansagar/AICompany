using System;
using System.Collections.Generic;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;

namespace Qdb.SurveyEngine.Dispatch
{
    /// <summary>
    /// Sends a Pending secure-link invitation by SMS and by email (FR-CSE-048, 049, 050), once.
    /// The token is issued here, because its plaintext may exist only in the message; its stored
    /// hash marks the invitation as dispatched, so a re-run sends nothing. A channel that cannot
    /// deliver (no mobile, no email, no configuration, a failed send) is logged as Not delivered and
    /// the other channel still goes out (NFR-CSE-001). Portal invitations need no message (FR-CSE-047).
    /// </summary>
    public sealed class InvitationDispatchService
    {
        private readonly DispatchDependencies _deps;

        public InvitationDispatchService(DispatchDependencies dependencies)
        {
            _deps = dependencies ?? throw new ArgumentNullException(nameof(dependencies));
            if (_deps.Store == null || _deps.Config == null || _deps.Sms == null || _deps.Email == null || _deps.Suppressions == null || _deps.Clock == null || _deps.Trace == null)
                throw new ArgumentException("Every DispatchDependencies member is required.", nameof(dependencies));
        }

        /// <summary>Dispatches the invitation if it is a Pending secure-link invitation that has not been sent yet.</summary>
        public void Dispatch(Guid invitationId)
        {
            var invitation = _deps.Store.FindInvitation(invitationId);
            if (!IsDue(invitation)) return;
            var settings = _deps.Config.GetSettings();
            var blocker = FindBlocker(settings);
            if (blocker != null) { NotDelivered(invitation, blocker); return; }
            var plan = PlanChannels(invitation, settings);
            if (!plan.CanSendAny) { NotDelivered(invitation, string.Join(" ", plan.Problems)); return; }
            var token = LinkToken.Generate();
            _deps.Store.SaveTokenHash(invitation.Id, LinkToken.Hash(token));
            var message = SurveyMessageComposer.Compose(invitation.Wording, invitation.LanguageCode, SurveyMessageComposer.BuildLink(settings.SecureLinkBaseUrl, token));
            var problems = new List<string>(plan.Problems);
            problems.AddRange(Send(invitation, plan, message));
            if (problems.Count > 0) NotDelivered(invitation, string.Join(" ", problems));
        }

        private bool IsDue(DispatchInvitation invitation)
        {
            if (invitation == null) { _deps.Trace.Write("Invitation not found; nothing to dispatch."); return false; }
            if (invitation.Channel != InvitationChannel.SecureLink || invitation.Status != InvitationStatus.Pending) return false;
            if (!invitation.HasToken) return true;
            _deps.Trace.Write($"Invitation {invitation.Id:D} was already dispatched.");
            return false;
        }

        private static string FindBlocker(DispatchSettings settings)
        {
            if (!settings.SecureLinkEnabled) return "Secure-link delivery is disabled in this org until its security review is signed off (NFR-CSE-009).";
            if (string.IsNullOrWhiteSpace(settings.SecureLinkBaseUrl)) return "Survey Settings has no Secure Link Base URL.";
            return null;
        }

        private ChannelPlan PlanChannels(DispatchInvitation invitation, DispatchSettings settings)
        {
            var sms = _deps.Config.FindActiveSmsConfig();
            var missing = sms == null ? "an active SMS configuration" : sms.MissingSetting();
            var contact = _deps.Store.ReadContact(invitation.CustomerId, missing == null ? sms.CustomerPhoneField : null);
            var plan = new ChannelPlan { Sms = missing == null && !string.IsNullOrWhiteSpace(contact.Mobile) ? sms : null, Contact = contact, SenderQueueId = settings.EmailSenderQueueId };
            if (missing != null) plan.Problems.Add($"SMS not sent: no {missing}.");
            else if (plan.Sms == null) plan.Problems.Add("SMS not sent: the customer has no mobile number.");
            if (!settings.EmailSenderQueueId.HasValue) plan.Problems.Add("Email not sent: Survey Settings has no Email Sender Queue.");
            else if (string.IsNullOrWhiteSpace(contact.Email)) plan.Problems.Add("Email not sent: the customer has no email address.");
            return plan;
        }

        private IEnumerable<string> Send(DispatchInvitation invitation, ChannelPlan plan, ComposedMessage message)
        {
            if (plan.Sms != null)
            {
                var sms = _deps.Sms.Send(plan.Sms, new SmsMessage { CustomerId = invitation.CustomerId, Recipient = plan.Contact.Mobile.Trim(), FullText = message.SmsFullText, ShortText = message.SmsShortText });
                if (!sms.IsSent) yield return "SMS failed: " + sms.Failure;
            }
            if (!plan.CanEmail) yield break;
            var email = _deps.Email.Send(new EmailMessage { SenderQueueId = plan.SenderQueueId.Value, CustomerId = invitation.CustomerId, InvitationId = invitation.Id, Subject = message.Subject, HtmlBody = message.EmailHtml });
            if (!email.IsSent) yield return "Email failed: " + email.Failure;
        }

        private void NotDelivered(DispatchInvitation invitation, string detail)
        {
            _deps.Suppressions.Write(new SuppressionEntry
            {
                Reason = SuppressionReason.NotDelivered,
                CustomerId = invitation.CustomerId,
                TriggerId = invitation.TriggerId,
                SetupId = invitation.SetupId,
                SourceTable = invitation.SourceTable,
                SourceRecordId = invitation.SourceRecordId,
                Detail = $"Invitation {invitation.Id:D}: {detail}",
                LoggedOn = _deps.Clock.UtcNow,
            });
            _deps.Trace.Write($"Not delivered: {detail}");
        }

        private sealed class ChannelPlan
        {
            public SmsHandOffConfig Sms { get; set; }
            public CustomerContact Contact { get; set; }
            public Guid? SenderQueueId { get; set; }
            public List<string> Problems { get; } = new List<string>();

            public bool CanEmail => SenderQueueId.HasValue && !string.IsNullOrWhiteSpace(Contact.Email);
            public bool CanSendAny => Sms != null || CanEmail;
        }
    }
}
