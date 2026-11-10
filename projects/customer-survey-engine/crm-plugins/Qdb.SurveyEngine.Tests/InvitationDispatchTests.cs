using System;
using System.Collections.Generic;
using System.Linq;
using Qdb.SurveyEngine.Dispatch;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>In-memory dispatch collaborators.</summary>
    public sealed class InMemoryDispatch : IDispatchStore, IDispatchConfigReader, ISmsHandOff, IEmailSender
    {
        public DispatchInvitation Invitation { get; set; }
        public CustomerContact Contact { get; set; } = new CustomerContact { Mobile = "+97455500000", Email = "customer@example.com" };
        public DispatchSettings Settings { get; set; } = new DispatchSettings { SecureLinkEnabled = true, SecureLinkBaseUrl = "https://portal.example/survey", EmailSenderQueueId = Guid.NewGuid() };
        public SmsHandOffConfig Sms { get; set; } = new SmsHandOffConfig { TableLogicalName = "fax", RecipientField = "faxnumber", MessageField = "qdb_message_body", CustomerPhoneField = "telephone1" };
        public string SavedTokenHash { get; private set; }
        public List<SmsMessage> SentSms { get; } = new List<SmsMessage>();
        public List<EmailMessage> SentEmail { get; } = new List<EmailMessage>();
        public string EmailFailure { get; set; }

        public DispatchInvitation FindInvitation(Guid invitationId) => Invitation?.Id == invitationId ? Invitation : null;
        public CustomerContact ReadContact(Guid customerId, string phoneField) => new CustomerContact { Email = Contact.Email, Mobile = phoneField == null ? null : Contact.Mobile };
        public void SaveTokenHash(Guid invitationId, string tokenHash) => SavedTokenHash = tokenHash;
        public DispatchSettings GetSettings() => Settings;
        public SmsHandOffConfig FindActiveSmsConfig() => Sms;

        public ChannelOutcome Send(SmsHandOffConfig config, SmsMessage message)
        {
            SentSms.Add(message);
            return ChannelOutcome.Sent();
        }

        public ChannelOutcome Send(EmailMessage message)
        {
            if (EmailFailure != null) return ChannelOutcome.Failed(EmailFailure);
            SentEmail.Add(message);
            return ChannelOutcome.Sent();
        }
    }

    public class InvitationDispatchServiceTests
    {
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemoryDispatch _dispatch = new InMemoryDispatch();

        public InvitationDispatchServiceTests()
        {
            _dispatch.Invitation = new DispatchInvitation
            {
                Id = Guid.NewGuid(), CustomerId = Guid.NewGuid(), SetupId = Guid.NewGuid(), TriggerId = Guid.NewGuid(),
                Status = InvitationStatus.Pending, Channel = InvitationChannel.SecureLink, LanguageCode = "en",
                Wording = new SurveyWording { TitleEnglish = "How did we do?", TitleArabic = "كيف كانت تجربتك؟", MessageEnglish = "Two minutes, please." },
            };
        }

        private void Dispatch() => new InvitationDispatchService(new DispatchDependencies
        {
            Store = _dispatch, Config = _dispatch, Sms = _dispatch, Email = _dispatch, Suppressions = _pipeline, Clock = _pipeline, Trace = _pipeline,
        }).Dispatch(_dispatch.Invitation.Id);

        private SuppressionEntry OnlyLogRow() => Assert.Single(_pipeline.Suppressions);

        [Fact]
        public void Dispatch_BothChannelsAvailable_SendsSmsAndEmailAndLogsNothing()
        {
            Dispatch();

            Assert.Single(_dispatch.SentSms);
            Assert.Single(_dispatch.SentEmail);
            Assert.Empty(_pipeline.Suppressions);
        }

        [Fact]
        public void Dispatch_Link_CarriesTheTokenWhoseHashIsStored()
        {
            Dispatch();

            var link = _dispatch.SentSms.Single().FullText.Split('\n').Last();
            var token = Uri.UnescapeDataString(link.Substring(link.IndexOf("token=", StringComparison.Ordinal) + "token=".Length));
            Assert.Equal(_dispatch.SavedTokenHash, LinkToken.Hash(token));
        }

        [Fact]
        public void Dispatch_ArabicCustomer_UsesTheArabicTitle()
        {
            _dispatch.Invitation.LanguageCode = "ar";

            Dispatch();

            Assert.Equal("كيف كانت تجربتك؟", _dispatch.SentEmail.Single().Subject);
        }

        [Fact]
        public void Dispatch_PortalInvitation_SendsNothing()
        {
            _dispatch.Invitation.Channel = InvitationChannel.Portal;

            Dispatch();

            Assert.Empty(_dispatch.SentSms.Cast<object>().Concat(_dispatch.SentEmail));
            Assert.Null(_dispatch.SavedTokenHash);
        }

        [Fact]
        public void Dispatch_AlreadyDispatched_SendsNothingAgain()
        {
            _dispatch.Invitation.HasToken = true;

            Dispatch();

            Assert.Empty(_dispatch.SentSms);
        }

        [Fact]
        public void Dispatch_SecureLinkDisabled_LogsNotDeliveredAndIssuesNoToken()
        {
            _dispatch.Settings.SecureLinkEnabled = false;

            Dispatch();

            Assert.Equal(SuppressionReason.NotDelivered, OnlyLogRow().Reason);
            Assert.Null(_dispatch.SavedTokenHash);
        }

        [Fact]
        public void Dispatch_NoBaseUrl_LogsNotDelivered()
        {
            _dispatch.Settings.SecureLinkBaseUrl = " ";

            Dispatch();

            Assert.Contains("Base URL", OnlyLogRow().Detail);
        }

        [Fact]
        public void Dispatch_NoMobileNumber_StillEmailsAndLogsTheMissingSms()
        {
            _dispatch.Contact.Mobile = null;

            Dispatch();

            Assert.Single(_dispatch.SentEmail);
            Assert.Contains("no mobile number", OnlyLogRow().Detail);
        }

        [Fact]
        public void Dispatch_NoSmsConfigAndNoSenderQueue_SendsNothingIssuesNoTokenAndLogsBoth()
        {
            _dispatch.Sms = null;
            _dispatch.Settings.EmailSenderQueueId = null;

            Dispatch();

            Assert.Null(_dispatch.SavedTokenHash);
            Assert.Contains("SMS not sent", OnlyLogRow().Detail);
            Assert.Contains("Email Sender Queue", OnlyLogRow().Detail);
        }

        [Fact]
        public void Dispatch_IncompleteSmsConfig_NamesTheMissingSetting()
        {
            _dispatch.Sms.CustomerPhoneField = null;

            Dispatch();

            Assert.Contains("no customer mobile field", OnlyLogRow().Detail);
        }

        [Fact]
        public void Dispatch_EmailSendFails_LogsTheFailureAfterSendingTheSms()
        {
            _dispatch.EmailFailure = "The sender queue has no email address.";

            Dispatch();

            Assert.Single(_dispatch.SentSms);
            Assert.Contains("Email failed: The sender queue has no email address.", OnlyLogRow().Detail);
        }
    }

    public class SurveyMessageComposerTests
    {
        private static readonly SurveyWording Wording = new SurveyWording { TitleEnglish = "How did we do?", MessageEnglish = "Two minutes, please." };

        [Fact]
        public void BuildLink_BaseUrlWithQuery_AppendsTheTokenWithAnAmpersand()
        {
            Assert.Equal("https://p.example/s?lang=en&token=a%2Bb", SurveyMessageComposer.BuildLink("https://p.example/s?lang=en", "a+b"));
        }

        [Fact]
        public void Compose_ArabicWithoutArabicWording_FallsBackToEnglish()
        {
            Assert.Equal("How did we do?", SurveyMessageComposer.Compose(Wording, "ar", "https://x").Subject);
        }

        [Fact]
        public void Compose_ShortText_KeepsTitleAndLinkOnly()
        {
            Assert.Equal("How did we do?\nhttps://x", SurveyMessageComposer.Compose(Wording, "en", "https://x").SmsShortText);
        }

        [Fact]
        public void Compose_ArabicEmail_IsRightToLeft()
        {
            Assert.Contains("dir=\"rtl\"", SurveyMessageComposer.Compose(Wording, "ar", "https://x").EmailHtml);
        }

        [Fact]
        public void Compose_EmailBody_EncodesTheMessage()
        {
            var wording = new SurveyWording { TitleEnglish = "T", MessageEnglish = "<script>x</script>" };

            Assert.DoesNotContain("<script>", SurveyMessageComposer.Compose(wording, "en", "https://x").EmailHtml);
        }
    }
}
