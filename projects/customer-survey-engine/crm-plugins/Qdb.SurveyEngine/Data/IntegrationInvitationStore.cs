using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads invitations for the integration APIs and closes them on submit, with optimistic concurrency.</summary>
    public sealed class IntegrationInvitationStore : IIntegrationInvitationStore
    {
        private const string SetupAlias = "setup";
        private const int RowVersionMismatchError = unchecked((int)0x80060882);
        private static readonly string[] InvitationColumns =
        {
            "qdb_survey_setup_id", "qdb_form_code", "qdb_pinned_version", "qdb_language_code", "qdb_status", "qdb_channel",
            "qdb_expires_on", "qdb_token_used_on", "qdb_source_table", "qdb_source_record_id", "versionnumber",
        };
        private readonly IOrganizationService _service;
        private readonly CustomerLink _customer;
        private readonly string[] _invitationColumns;

        public IntegrationInvitationStore(IOrganizationService service, CustomerLink customer)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _customer = customer ?? throw new ArgumentNullException(nameof(customer));
            _invitationColumns = InvitationColumns.Concat(new[] { customer.LookupColumn }).ToArray();
        }

        /// <inheritdoc />
        public InvitationRecord FindById(Guid invitationId) => FindOne("qdb_survey_invitationid", invitationId);

        /// <inheritdoc />
        public InvitationRecord FindByTokenHash(string tokenHash) => FindOne("qdb_token_hash", tokenHash);

        /// <inheritdoc />
        public IReadOnlyList<PendingInvitation> ListOpen(Guid customerId, DateTime nowUtc)
        {
            var query = new QueryExpression("qdb_survey_invitation") { ColumnSet = new ColumnSet(_invitationColumns) };
            query.Criteria.AddCondition(_customer.LookupColumn, ConditionOperator.Equal, customerId);
            query.Criteria.AddCondition("qdb_status", ConditionOperator.Equal, (int)InvitationStatus.Pending);
            var notExpired = query.Criteria.AddFilter(LogicalOperator.Or);
            notExpired.AddCondition("qdb_expires_on", ConditionOperator.Null);
            notExpired.AddCondition("qdb_expires_on", ConditionOperator.GreaterThan, nowUtc);
            query.AddOrder("qdb_generated_on", OrderType.Ascending);
            query.LinkEntities.Add(new LinkEntity("qdb_survey_invitation", "qdb_survey_setup", "qdb_survey_setup_id", "qdb_survey_setupid", JoinOperator.Inner)
            {
                EntityAlias = SetupAlias,
                Columns = new ColumnSet("qdb_notif_title_en", "qdb_notif_title_ar", "qdb_notif_message_en", "qdb_notif_message_ar"),
            });
            return _service.RetrieveMultiple(query).Entities.Select(MapPending).ToList();
        }

        /// <inheritdoc />
        public bool TryClose(InvitationClosure closure)
        {
            var change = new Entity("qdb_survey_invitation", closure.Invitation.Id)
            {
                ["qdb_status"] = new OptionSetValue((int)InvitationStatus.Submitted),
                RowVersion = closure.Invitation.RowVersion,
            };
            if (closure.WasOpenedByToken) change["qdb_token_used_on"] = closure.SubmittedOn;
            try
            {
                _service.Execute(new UpdateRequest { Target = change, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
                return true;
            }
            catch (FaultException<OrganizationServiceFault> fault) when (fault.Detail.ErrorCode == RowVersionMismatchError)
            {
                return false;
            }
        }

        private InvitationRecord FindOne(string attribute, object value)
        {
            var query = new QueryExpression("qdb_survey_invitation") { ColumnSet = new ColumnSet(_invitationColumns), TopCount = 1 };
            query.Criteria.AddCondition(attribute, ConditionOperator.Equal, value);
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return row == null ? null : Map(row);
        }

        private PendingInvitation MapPending(Entity row) => new PendingInvitation
        {
            Invitation = Map(row),
            TitleEnglish = Aliased(row, "qdb_notif_title_en"),
            TitleArabic = Aliased(row, "qdb_notif_title_ar"),
            MessageEnglish = Aliased(row, "qdb_notif_message_en"),
            MessageArabic = Aliased(row, "qdb_notif_message_ar"),
        };

        private InvitationRecord Map(Entity row) => new InvitationRecord
        {
            Id = row.Id,
            CustomerId = _customer.CustomerIdOf(row) ?? Guid.Empty,
            SetupId = row.GetAttributeValue<EntityReference>("qdb_survey_setup_id")?.Id ?? Guid.Empty,
            FormCode = row.GetAttributeValue<string>("qdb_form_code"),
            PinnedVersion = row.GetAttributeValue<int?>("qdb_pinned_version") ?? 0,
            LanguageCode = row.GetAttributeValue<string>("qdb_language_code") ?? "en",
            Status = (InvitationStatus)(row.GetAttributeValue<OptionSetValue>("qdb_status")?.Value ?? (int)InvitationStatus.Pending),
            Channel = (InvitationChannel?)row.GetAttributeValue<OptionSetValue>("qdb_channel")?.Value,
            ExpiresOn = row.GetAttributeValue<DateTime?>("qdb_expires_on"),
            TokenUsedOn = row.GetAttributeValue<DateTime?>("qdb_token_used_on"),
            SourceTable = row.GetAttributeValue<string>("qdb_source_table"),
            SourceRecordId = row.GetAttributeValue<string>("qdb_source_record_id"),
            RowVersion = row.RowVersion,
        };

        private static string Aliased(Entity row, string attribute) => row.GetAttributeValue<AliasedValue>(SetupAlias + "." + attribute)?.Value as string;
    }
}
