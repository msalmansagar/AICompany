using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Reads Postponed invitations and moves them with optimistic concurrency (row version), so
    /// two overlapping runs can never both release or discard the same invitation (section 7.1).
    /// </summary>
    public sealed class PostponedInvitationStore : IPostponedInvitationStore
    {
        private const string SetupAlias = "setup";
        private const int RowVersionMismatchError = unchecked((int)0x80060882);
        private readonly IOrganizationService _service;
        private readonly CustomerLink _customer;

        public PostponedInvitationStore(IOrganizationService service, CustomerLink customer)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _customer = customer ?? throw new ArgumentNullException(nameof(customer));
        }

        /// <inheritdoc />
        public IReadOnlyList<PostponedInvitation> GetPostponed()
        {
            var query = new QueryExpression("qdb_survey_invitation")
            {
                ColumnSet = new ColumnSet(_customer.LookupColumn, "qdb_survey_trigger_id", "qdb_source_table", "qdb_source_record_id", "qdb_expires_on", "versionnumber"),
            };
            query.Criteria.AddCondition("qdb_status", ConditionOperator.Equal, (int)InvitationStatus.Postponed);
            query.Criteria.AddCondition(_customer.LookupColumn, ConditionOperator.NotNull);
            query.AddOrder("qdb_generated_on", OrderType.Ascending);
            // Inner join: an invitation whose setup was deleted has nothing to release into.
            query.LinkEntities.Add(new LinkEntity("qdb_survey_invitation", "qdb_survey_setup", "qdb_survey_setup_id", "qdb_survey_setupid", JoinOperator.Inner)
            {
                EntityAlias = SetupAlias,
                Columns = new ColumnSet("qdb_survey_setupid", "qdb_is_active", "qdb_active_from", "qdb_active_to"),
            });
            query.AddOrder("qdb_survey_invitationid", OrderType.Ascending);
            return _service.RetrieveAll(query).Select(Map).ToList();
        }

        /// <inheritdoc />
        public bool TryRelease(PostponedInvitation invitation, DateTime nowUtc) =>
            TryUpdate(invitation, new Entity("qdb_survey_invitation", invitation.Id)
            {
                ["qdb_status"] = new OptionSetValue((int)InvitationStatus.Pending),
                // Generated now: the fatigue window and reporting count from the moment it was actually sent.
                ["qdb_generated_on"] = nowUtc,
            });

        /// <inheritdoc />
        public bool TryDiscard(PostponedInvitation invitation) =>
            TryUpdate(invitation, new Entity("qdb_survey_invitation", invitation.Id) { ["qdb_status"] = new OptionSetValue((int)InvitationStatus.Discarded) });

        private bool TryUpdate(PostponedInvitation invitation, Entity change)
        {
            change.RowVersion = invitation.RowVersion;
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

        private PostponedInvitation Map(Entity row)
        {
            var recordId = row.GetAttributeValue<string>("qdb_source_record_id");
            Guid parsed;
            return new PostponedInvitation
            {
                Id = row.Id,
                CustomerId = _customer.CustomerIdOf(row).Value,
                TriggerId = row.GetAttributeValue<EntityReference>("qdb_survey_trigger_id")?.Id ?? Guid.Empty,
                Setup = new SurveySetup
                {
                    Id = (Guid)Aliased(row, "qdb_survey_setupid"),
                    ActiveFrom = (DateTime?)Aliased(row, "qdb_active_from"),
                    ActiveTo = (DateTime?)Aliased(row, "qdb_active_to"),
                },
                IsSetupActive = (bool?)Aliased(row, "qdb_is_active") ?? false,
                SourceTable = row.GetAttributeValue<string>("qdb_source_table"),
                SourceRecordId = Guid.TryParse(recordId, out parsed) ? parsed : (Guid?)null,
                ExpiresOn = row.GetAttributeValue<DateTime?>("qdb_expires_on"),
                RowVersion = row.RowVersion,
            };
        }

        private static object Aliased(Entity row, string attribute) => row.GetAttributeValue<AliasedValue>(SetupAlias + "." + attribute)?.Value;
    }
}
