using System;
using System.Linq;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Reads and creates qdb_survey_invitation rows.</summary>
    public sealed class InvitationRepository : IInvitationRepository
    {
        // "A record with matching key values already exists" (alternate key) and the generic duplicate code.
        private const int DuplicateAlternateKeyError = unchecked((int)0x80060892);
        private const int DuplicateRecordError = unchecked((int)0x80040237);
        private readonly IOrganizationService _service;

        public InvitationRepository(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public bool ExistsWithDedupeKey(string dedupeKey)
        {
            var query = new QueryExpression("qdb_survey_invitation") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition("qdb_dedupe_key", ConditionOperator.Equal, dedupeKey);
            return _service.RetrieveMultiple(query).Entities.Any();
        }

        /// <inheritdoc />
        public bool HasSentInvitationSince(Guid customerId, DateTime sinceUtc)
        {
            var query = new QueryExpression("qdb_survey_invitation") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition("qdb_customer_id", ConditionOperator.Equal, customerId);
            query.Criteria.AddCondition("qdb_generated_on", ConditionOperator.GreaterEqual, sinceUtc);
            // Postponed and Discarded invitations were never sent, so they do not count toward the limit.
            query.Criteria.AddCondition("qdb_status", ConditionOperator.In,
                (int)InvitationStatus.Pending, (int)InvitationStatus.Submitted, (int)InvitationStatus.Expired);
            return _service.RetrieveMultiple(query).Entities.Any();
        }

        /// <inheritdoc />
        public int GetLastMilestoneIndex(Guid setupId, Guid customerId)
        {
            var query = new QueryExpression("qdb_survey_invitation") { ColumnSet = new ColumnSet("qdb_milestone_index"), TopCount = 1 };
            query.Criteria.AddCondition("qdb_survey_setup_id", ConditionOperator.Equal, setupId);
            query.Criteria.AddCondition("qdb_customer_id", ConditionOperator.Equal, customerId);
            query.Criteria.AddCondition("qdb_milestone_index", ConditionOperator.NotNull);
            query.AddOrder("qdb_milestone_index", OrderType.Descending);
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return row?.GetAttributeValue<int?>("qdb_milestone_index") ?? 0;
        }

        /// <inheritdoc />
        public bool TryCreate(InvitationDraft draft)
        {
            try
            {
                _service.Create(ToEntity(draft));
                return true;
            }
            catch (FaultException<OrganizationServiceFault> fault) when (fault.Detail.ErrorCode == DuplicateAlternateKeyError || fault.Detail.ErrorCode == DuplicateRecordError)
            {
                return false;
            }
        }

        private static Entity ToEntity(InvitationDraft draft) => new Entity("qdb_survey_invitation")
        {
            ["qdb_name"] = Truncate(draft.Name, 200),
            ["qdb_customer_id"] = new EntityReference("account", draft.CustomerId),
            ["qdb_survey_setup_id"] = new EntityReference("qdb_survey_setup", draft.SetupId),
            ["qdb_survey_trigger_id"] = new EntityReference("qdb_survey_trigger", draft.TriggerId),
            ["qdb_source_table"] = draft.SourceTable,
            ["qdb_source_record_id"] = draft.SourceRecordId.ToString("D"),
            ["qdb_form_code"] = draft.FormCode,
            ["qdb_pinned_version"] = draft.PinnedVersion,
            ["qdb_language_code"] = draft.LanguageCode,
            ["qdb_status"] = new OptionSetValue((int)draft.Status),
            ["qdb_channel"] = new OptionSetValue((int)draft.Channel),
            ["qdb_generated_on"] = draft.GeneratedOn,
            ["qdb_expires_on"] = draft.ExpiresOn,
            ["qdb_dedupe_key"] = draft.DedupeKey,
            ["qdb_milestone_index"] = draft.MilestoneIndex,
        };

        internal static string Truncate(string text, int maxLength) =>
            text == null || text.Length <= maxLength ? text : text.Substring(0, maxLength);
    }

    /// <summary>Appends qdb_survey_suppression_log rows; it never updates or deletes them.</summary>
    public sealed class SuppressionLogWriter : ISuppressionLog
    {
        private readonly IOrganizationService _service;

        public SuppressionLogWriter(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public void Write(SuppressionEntry entry)
        {
            var row = new Entity("qdb_survey_suppression_log")
            {
                ["qdb_name"] = InvitationRepository.Truncate($"{entry.Reason} — {entry.SourceTable} {entry.SourceRecordId:D}", 200),
                ["qdb_reason"] = new OptionSetValue((int)entry.Reason),
                ["qdb_survey_trigger_id"] = new EntityReference("qdb_survey_trigger", entry.TriggerId),
                ["qdb_survey_setup_id"] = new EntityReference("qdb_survey_setup", entry.SetupId),
                ["qdb_source_table"] = entry.SourceTable,
                ["qdb_source_record_id"] = entry.SourceRecordId.ToString("D"),
                ["qdb_detail"] = entry.Detail,
                ["qdb_logged_on"] = entry.LoggedOn,
            };
            if (entry.CustomerId.HasValue) row["qdb_customer_id"] = new EntityReference("account", entry.CustomerId.Value);
            _service.Create(row);
        }
    }

    /// <summary>Reads the active DFE render cache row for a form and language.</summary>
    public sealed class RenderCacheReader : IRenderCacheReader
    {
        private const int ActiveCacheStatus = 2;
        private readonly IOrganizationService _service;

        public RenderCacheReader(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public int? FindActivePublishedVersion(string formCode, string languageCode)
        {
            var query = new QueryExpression("qdb_form_render_cache") { ColumnSet = new ColumnSet("qdb_published_version"), TopCount = 1 };
            query.Criteria.AddCondition("qdb_form_code", ConditionOperator.Equal, formCode);
            query.Criteria.AddCondition("qdb_language_code", ConditionOperator.Equal, languageCode);
            query.Criteria.AddCondition("qdb_is_active", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("qdb_status", ConditionOperator.Equal, ActiveCacheStatus);
            query.AddOrder("qdb_published_version", OrderType.Descending);
            var row = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return row?.GetAttributeValue<int?>("qdb_published_version");
        }
    }

    /// <summary>Reads the customer's language field from account.</summary>
    public sealed class CustomerLanguageReader : ICustomerLanguageReader
    {
        private readonly IOrganizationService _service;

        public CustomerLanguageReader(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public object ReadLanguageValue(Guid customerId, string field)
        {
            var account = _service.Retrieve("account", customerId, new ColumnSet(field));
            if (!account.Contains(field)) return null;
            var value = account[field];
            return value is OptionSetValue option ? (object)option.Value : value;
        }
    }
}
