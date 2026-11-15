using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Erasure;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Finds and deletes survey data for one customer; filters every table on the org's
    /// CustomerLink column so the same code works for both account and contact orgs (NFR-CSE-014,
    /// C.3.3). A contact GUID on an account org matches zero rows and returns empty lists.
    /// </summary>
    public sealed class CustomerSurveyDataRepository : ICustomerSurveyDataRepository
    {
        private readonly IOrganizationService _service;
        private readonly CustomerLink _customer;

        public CustomerSurveyDataRepository(IOrganizationService service, CustomerLink customer)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _customer = customer ?? throw new ArgumentNullException(nameof(customer));
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> FindInvitations(Guid customerId)
        {
            var query = CustomerQuery("qdb_survey_invitation", "qdb_survey_invitationid", customerId);
            return _service.RetrieveAll(query).Select(e => e.Id).ToList();
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> FindResponses(Guid customerId)
        {
            var query = CustomerQuery("qdb_survey_response", "qdb_survey_responseid", customerId);
            return _service.RetrieveAll(query).Select(e => e.Id).ToList();
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> FindResidualResponses(Guid customerId)
        {
            var query = CustomerQuery("qdb_survey_response", "qdb_survey_responseid", customerId);
            // Only those whose invitation link was already null before the cascade ran (defensive step).
            query.Criteria.AddCondition("qdb_survey_invitation_id", ConditionOperator.Null);
            return _service.RetrieveAll(query).Select(e => e.Id).ToList();
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> FindAnswers(IReadOnlyList<Guid> responseIds)
        {
            if (responseIds.Count == 0) return new List<Guid>();
            var query = new QueryExpression("qdb_survey_answer") { ColumnSet = new ColumnSet(false) };
            query.Criteria.AddCondition("qdb_survey_response_id", ConditionOperator.In, responseIds.Cast<object>().ToArray());
            query.AddOrder("qdb_survey_answerid", OrderType.Ascending);
            return _service.RetrieveAll(query).Select(e => e.Id).ToList();
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> FindSuppressionLogs(Guid customerId)
        {
            var query = CustomerQuery("qdb_survey_suppression_log", "qdb_survey_suppression_logid", customerId);
            return _service.RetrieveAll(query).Select(e => e.Id).ToList();
        }

        /// <inheritdoc />
        public void DeleteInvitation(Guid id) => _service.Delete("qdb_survey_invitation", id);

        /// <inheritdoc />
        public void DeleteResponse(Guid id) => _service.Delete("qdb_survey_response", id);

        /// <inheritdoc />
        public void DeleteSuppressionLog(Guid id) => _service.Delete("qdb_survey_suppression_log", id);

        private QueryExpression CustomerQuery(string entityName, string primaryKey, Guid customerId)
        {
            var query = new QueryExpression(entityName) { ColumnSet = new ColumnSet(false) };
            query.Criteria.AddCondition(_customer.LookupColumn, ConditionOperator.Equal, customerId);
            query.AddOrder(primaryKey, OrderType.Ascending);
            return query;
        }
    }
}
