using System;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Dispatch
{
    /// <summary>A secure-link invitation as dispatch needs it, with its setup's bilingual wording.</summary>
    public sealed class DispatchInvitation
    {
        public Guid Id { get; set; }
        public Guid CustomerId { get; set; }
        public Guid SetupId { get; set; }
        public Guid TriggerId { get; set; }
        public InvitationStatus Status { get; set; }
        public InvitationChannel? Channel { get; set; }
        public string LanguageCode { get; set; }
        public string SourceTable { get; set; }
        public Guid? SourceRecordId { get; set; }

        /// <summary>True once a token was issued, i.e. the invitation was already dispatched.</summary>
        public bool HasToken { get; set; }

        public SurveyWording Wording { get; set; } = new SurveyWording();
    }

    /// <summary>The setup's notification title and message in both languages (FR-CSE-012, 013).</summary>
    public sealed class SurveyWording
    {
        public string TitleEnglish { get; set; }
        public string TitleArabic { get; set; }
        public string MessageEnglish { get; set; }
        public string MessageArabic { get; set; }
    }

    /// <summary>How to reach the customer; either value may be empty.</summary>
    public sealed class CustomerContact
    {
        public string Mobile { get; set; }
        public string Email { get; set; }
    }

    /// <summary>A qdb_survey_sms_config row: which table and columns hand an SMS to this org's SMS service (FR-CSE-048).</summary>
    public sealed class SmsHandOffConfig
    {
        public string TableLogicalName { get; set; }
        public string RecipientField { get; set; }
        public string MessageField { get; set; }

        /// <summary>Optional lookup on the SMS table set to the customer (e.g. regardingobjectid).</summary>
        public string CustomerLinkField { get; set; }

        /// <summary>The account column holding the customer's mobile number.</summary>
        public string CustomerPhoneField { get; set; }

        /// <summary>{"column":"value",...} set as constants on every SMS row.</summary>
        public string StaticColumnsJson { get; set; }

        /// <summary>The field that is missing, or null when the configuration can hand off an SMS.</summary>
        public string MissingSetting()
        {
            if (string.IsNullOrWhiteSpace(TableLogicalName)) return "SMS table";
            if (string.IsNullOrWhiteSpace(RecipientField)) return "recipient field";
            if (string.IsNullOrWhiteSpace(MessageField)) return "message field";
            if (string.IsNullOrWhiteSpace(CustomerPhoneField)) return "customer mobile field";
            return null;
        }
    }

    /// <summary>The org settings dispatch reads.</summary>
    public sealed class DispatchSettings
    {
        public bool SecureLinkEnabled { get; set; }
        public string SecureLinkBaseUrl { get; set; }
        public Guid? EmailSenderQueueId { get; set; }
    }

    /// <summary>Reads invitations and customers, and records the issued token.</summary>
    public interface IDispatchStore
    {
        /// <summary>The invitation with its setup wording, or null when it no longer exists.</summary>
        DispatchInvitation FindInvitation(Guid invitationId);

        /// <summary>The customer's email (emailaddress1) and, when a field is given, mobile number.</summary>
        CustomerContact ReadContact(Guid customerId, string phoneField);

        /// <summary>Stores the token's hash on the invitation; the plaintext is never stored.</summary>
        void SaveTokenHash(Guid invitationId, string tokenHash);
    }

    /// <summary>Reads dispatch configuration.</summary>
    public interface IDispatchConfigReader
    {
        DispatchSettings GetSettings();

        /// <summary>The active SMS configuration, or null when the org has none.</summary>
        SmsHandOffConfig FindActiveSmsConfig();
    }

    /// <summary>Hands one SMS to the org's SMS service by creating a row in its SMS table.</summary>
    public interface ISmsHandOff
    {
        ChannelOutcome Send(SmsHandOffConfig config, SmsMessage message);
    }

    /// <summary>Creates and sends one CRM email activity.</summary>
    public interface IEmailSender
    {
        ChannelOutcome Send(EmailMessage message);
    }

    /// <summary>One SMS to hand off.</summary>
    public sealed class SmsMessage
    {
        public Guid CustomerId { get; set; }
        public string Recipient { get; set; }

        /// <summary>Title, message and link.</summary>
        public string FullText { get; set; }

        /// <summary>Title and link only, for an SMS table whose message column is too short for the full text.</summary>
        public string ShortText { get; set; }
    }

    /// <summary>One email to send.</summary>
    public sealed class EmailMessage
    {
        public Guid SenderQueueId { get; set; }
        public Guid CustomerId { get; set; }
        public Guid InvitationId { get; set; }
        public string Subject { get; set; }
        public string HtmlBody { get; set; }
    }

    /// <summary>Whether a channel delivered, and why not.</summary>
    public sealed class ChannelOutcome
    {
        private ChannelOutcome(string failure)
        {
            Failure = failure;
        }

        public bool IsSent => Failure == null;

        /// <summary>Why the channel did not deliver; null when sent.</summary>
        public string Failure { get; }

        public static ChannelOutcome Sent() => new ChannelOutcome(null);

        public static ChannelOutcome Failed(string reason) => new ChannelOutcome(reason ?? "unknown failure");
    }

    /// <summary>All collaborators of <see cref="InvitationDispatchService"/>.</summary>
    public sealed class DispatchDependencies
    {
        public IDispatchStore Store { get; set; }
        public IDispatchConfigReader Config { get; set; }
        public ISmsHandOff Sms { get; set; }
        public IEmailSender Email { get; set; }
        public ISuppressionLog Suppressions { get; set; }
        public IClock Clock { get; set; }
        public ITrace Trace { get; set; }
    }
}
