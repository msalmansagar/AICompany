using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Dispatch;
using Qdb.SurveyEngine.Domain;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads invitations, customers and dispatch configuration for B7, and stores issued token hashes.</summary>
    public sealed class DispatchStore : IDispatchStore, IDispatchConfigReader
    {
        private const string SetupAlias = "setup";
        private readonly IOrganizationService _service;

        public DispatchStore(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public DispatchInvitation FindInvitation(Guid invitationId)
        {
            var query = new QueryExpression("qdb_survey_invitation")
            {
                ColumnSet = new ColumnSet("qdb_customer_id", "qdb_survey_setup_id", "qdb_survey_trigger_id", "qdb_status", "qdb_channel", "qdb_language_code",
                    "qdb_source_table", "qdb_source_record_id", "qdb_token_hash"),
                TopCount = 1,
            };
            query.Criteria.AddCondition("qdb_survey_invitationid", ConditionOperator.Equal, invitationId);
            query.LinkEntities.Add(new LinkEntity("qdb_survey_invitation", "qdb_survey_setup", "qdb_survey_setup_id", "qdb_survey_setupid", JoinOperator.LeftOuter)
            {
                EntityAlias = SetupAlias,
                Columns = new ColumnSet("qdb_notif_title_en", "qdb_notif_title_ar", "qdb_notif_message_en", "qdb_notif_message_ar"),
            });
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return row == null ? null : MapInvitation(row);
        }

        /// <inheritdoc />
        public CustomerContact ReadContact(Guid customerId, string phoneField)
        {
            var email = _service.Retrieve("account", customerId, new ColumnSet("emailaddress1")).GetAttributeValue<string>("emailaddress1");
            return new CustomerContact { Email = email, Mobile = string.IsNullOrWhiteSpace(phoneField) ? null : ReadMobile(customerId, phoneField) };
        }

        // Read on its own so a mistyped mobile field costs only the SMS: the dispatcher then logs
        // "no mobile number" and the email still goes out.
        private string ReadMobile(Guid customerId, string phoneField)
        {
            try
            {
                return _service.Retrieve("account", customerId, new ColumnSet(phoneField)).GetAttributeValue<object>(phoneField)?.ToString();
            }
            catch (System.ServiceModel.FaultException<OrganizationServiceFault>)
            {
                return null;
            }
        }

        /// <inheritdoc />
        public void SaveTokenHash(Guid invitationId, string tokenHash) =>
            _service.Update(new Entity("qdb_survey_invitation", invitationId) { ["qdb_token_hash"] = tokenHash });

        /// <inheritdoc />
        public DispatchSettings GetSettings()
        {
            var query = new QueryExpression("qdb_survey_settings") { ColumnSet = new ColumnSet("qdb_securelink_enabled", "qdb_securelink_base_url", "qdb_email_sender_queue_id"), TopCount = 1 };
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            if (row == null) return new DispatchSettings();
            return new DispatchSettings
            {
                SecureLinkEnabled = row.GetAttributeValue<bool?>("qdb_securelink_enabled") ?? false,
                SecureLinkBaseUrl = row.GetAttributeValue<string>("qdb_securelink_base_url"),
                EmailSenderQueueId = row.GetAttributeValue<EntityReference>("qdb_email_sender_queue_id")?.Id,
            };
        }

        /// <inheritdoc />
        public SmsHandOffConfig FindActiveSmsConfig()
        {
            var query = new QueryExpression("qdb_survey_sms_config")
            {
                ColumnSet = new ColumnSet("qdb_sms_table_logical_name", "qdb_recipient_field", "qdb_message_field", "qdb_customer_link_field", "qdb_customer_phone_field", "qdb_static_columns_json"),
                TopCount = 1,
            };
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.AddOrder("createdon", OrderType.Ascending);
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            if (row == null) return null;
            return new SmsHandOffConfig
            {
                TableLogicalName = row.GetAttributeValue<string>("qdb_sms_table_logical_name"),
                RecipientField = row.GetAttributeValue<string>("qdb_recipient_field"),
                MessageField = row.GetAttributeValue<string>("qdb_message_field"),
                CustomerLinkField = row.GetAttributeValue<string>("qdb_customer_link_field"),
                CustomerPhoneField = row.GetAttributeValue<string>("qdb_customer_phone_field"),
                StaticColumnsJson = row.GetAttributeValue<string>("qdb_static_columns_json"),
            };
        }

        private static DispatchInvitation MapInvitation(Entity row)
        {
            var recordId = row.GetAttributeValue<string>("qdb_source_record_id");
            Guid parsed;
            return new DispatchInvitation
            {
                Id = row.Id,
                CustomerId = row.GetAttributeValue<EntityReference>("qdb_customer_id")?.Id ?? Guid.Empty,
                SetupId = row.GetAttributeValue<EntityReference>("qdb_survey_setup_id")?.Id ?? Guid.Empty,
                TriggerId = row.GetAttributeValue<EntityReference>("qdb_survey_trigger_id")?.Id ?? Guid.Empty,
                Status = (InvitationStatus)(row.GetAttributeValue<OptionSetValue>("qdb_status")?.Value ?? (int)InvitationStatus.Pending),
                Channel = (InvitationChannel?)row.GetAttributeValue<OptionSetValue>("qdb_channel")?.Value,
                LanguageCode = row.GetAttributeValue<string>("qdb_language_code") ?? "en",
                SourceTable = row.GetAttributeValue<string>("qdb_source_table"),
                SourceRecordId = Guid.TryParse(recordId, out parsed) ? parsed : (Guid?)null,
                HasToken = !string.IsNullOrEmpty(row.GetAttributeValue<string>("qdb_token_hash")),
                Wording = new SurveyWording
                {
                    TitleEnglish = Aliased(row, "qdb_notif_title_en"),
                    TitleArabic = Aliased(row, "qdb_notif_title_ar"),
                    MessageEnglish = Aliased(row, "qdb_notif_message_en"),
                    MessageArabic = Aliased(row, "qdb_notif_message_ar"),
                },
            };
        }

        private static string Aliased(Entity row, string attribute) => row.GetAttributeValue<AliasedValue>(SetupAlias + "." + attribute)?.Value as string;
    }
}
