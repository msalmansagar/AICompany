using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Scheduling;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>Applies the retention setting to qdb_survey_response and its answers (FR-CSE-058, section 12).</summary>
    public sealed class ResponseRetentionStore : IResponseRetentionStore
    {
        public const string AnonymisedName = "Anonymised response";
        private readonly IOrganizationService _service;

        public ResponseRetentionStore(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public IReadOnlyList<Guid> FindSubmittedBefore(DateTime cutoffUtc) => Find(SubmittedBefore(cutoffUtc));

        /// <inheritdoc />
        public IReadOnlyList<Guid> FindIdentifiedSubmittedBefore(DateTime cutoffUtc)
        {
            var query = SubmittedBefore(cutoffUtc);
            // An anonymised response has no customer, so it is not picked up again tomorrow.
            query.Criteria.AddCondition("qdb_customer_id", ConditionOperator.NotNull);
            return Find(query);
        }

        /// <inheritdoc />
        public void Delete(Guid responseId) => _service.Delete("qdb_survey_response", responseId);

        /// <inheritdoc />
        public void Anonymise(Guid responseId)
        {
            foreach (var answerId in FindAnswers(responseId))
                _service.Update(new Entity("qdb_survey_answer", answerId) { ["qdb_answer_text"] = null });
            _service.Update(new Entity("qdb_survey_response", responseId)
            {
                ["qdb_name"] = AnonymisedName,
                ["qdb_customer_id"] = null,
                ["qdb_answers_json"] = null,
            });
        }

        private static QueryExpression SubmittedBefore(DateTime cutoffUtc)
        {
            var query = new QueryExpression("qdb_survey_response") { ColumnSet = new ColumnSet(false) };
            query.Criteria.AddCondition("qdb_submitted_on", ConditionOperator.LessThan, cutoffUtc);
            query.AddOrder("qdb_submitted_on", OrderType.Ascending);
            return query;
        }

        private IReadOnlyList<Guid> FindAnswers(Guid responseId)
        {
            var query = new QueryExpression("qdb_survey_answer") { ColumnSet = new ColumnSet(false) };
            query.Criteria.AddCondition("qdb_survey_response_id", ConditionOperator.Equal, responseId);
            query.AddOrder("qdb_survey_answerid", OrderType.Ascending);
            return Find(query);
        }

        private IReadOnlyList<Guid> Find(QueryExpression query) => _service.RetrieveAll(query).Select(e => e.Id).ToList();
    }
}
