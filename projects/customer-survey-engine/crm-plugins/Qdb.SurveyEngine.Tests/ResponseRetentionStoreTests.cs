using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>
    /// Tests the CRM-backed ResponseRetentionStore against both customer table variants.
    /// The contact path had never run anywhere before these tests (QA risk RISK-01).
    /// </summary>
    public class ResponseRetentionStoreTests
    {
        private static readonly Guid ResponseId = new Guid("11111111-1111-1111-1111-111111111111");
        private static readonly Guid AnswerId1 = new Guid("22222222-2222-2222-2222-222222222222");
        private static readonly Guid AnswerId2 = new Guid("33333333-3333-3333-3333-333333333333");

        private static Mock<IOrganizationService> ServiceWithAnswers(params Guid[] answerIds)
        {
            var service = new Mock<IOrganizationService>();
            var answerEntities = answerIds.Select(id => new Entity("qdb_survey_answer", id)).ToList();
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityNameOf(q) == "qdb_survey_answer")))
                   .Returns(new EntityCollection(answerEntities) { MoreRecords = false });
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityNameOf(q) != "qdb_survey_answer")))
                   .Returns(new EntityCollection() { MoreRecords = false });
            return service;
        }

        private static string EntityNameOf(QueryBase q) => (q as QueryExpression)?.EntityName ?? string.Empty;

        [Fact]
        public void Delete_AccountOrg_CallsServiceDeleteOnTheSurveyResponseEntity()
        {
            var service = ServiceWithAnswers();
            new ResponseRetentionStore(service.Object, CustomerLink.Account).Delete(ResponseId);

            service.Verify(s => s.Delete("qdb_survey_response", ResponseId), Times.Once());
        }

        [Fact]
        public void Delete_ContactOrg_CallsServiceDeleteOnTheSurveyResponseEntity()
        {
            var service = ServiceWithAnswers();
            new ResponseRetentionStore(service.Object, CustomerLink.Contact).Delete(ResponseId);

            service.Verify(s => s.Delete("qdb_survey_response", ResponseId), Times.Once());
        }

        [Fact]
        public void Anonymise_AccountOrg_SetsTheName_NullsTheAccountLookup_NullsAnswersJson()
        {
            var service = ServiceWithAnswers();
            Entity written = null;
            service.Setup(s => s.Update(It.Is<Entity>(e => e.LogicalName == "qdb_survey_response")))
                   .Callback<Entity>(e => written = e);

            new ResponseRetentionStore(service.Object, CustomerLink.Account).Anonymise(ResponseId);

            Assert.Equal(ResponseRetentionStore.AnonymisedName, written.GetAttributeValue<string>("qdb_name"));
            Assert.True(written.Contains("qdb_customer_id") && written["qdb_customer_id"] == null);
            Assert.True(written.Contains("qdb_answers_json") && written["qdb_answers_json"] == null);
        }

        [Fact]
        public void Anonymise_AccountOrg_DoesNotTouchTheContactLookupColumn()
        {
            var service = ServiceWithAnswers();
            Entity written = null;
            service.Setup(s => s.Update(It.Is<Entity>(e => e.LogicalName == "qdb_survey_response")))
                   .Callback<Entity>(e => written = e);

            new ResponseRetentionStore(service.Object, CustomerLink.Account).Anonymise(ResponseId);

            // Contact lookup must NOT appear — nulling a column you don't own would corrupt Contact-org data
            Assert.False(written.Contains("qdb_customer_contact_id"));
        }

        [Fact]
        public void Anonymise_ContactOrg_NullsTheContactLookupNotTheAccountLookup()
        {
            var service = ServiceWithAnswers();
            Entity written = null;
            service.Setup(s => s.Update(It.Is<Entity>(e => e.LogicalName == "qdb_survey_response")))
                   .Callback<Entity>(e => written = e);

            new ResponseRetentionStore(service.Object, CustomerLink.Contact).Anonymise(ResponseId);

            Assert.True(written.Contains("qdb_customer_contact_id") && written["qdb_customer_contact_id"] == null);
            Assert.False(written.Contains("qdb_customer_id"));
        }

        [Fact]
        public void Anonymise_WithAnswers_NullsEachAnswerText()
        {
            var service = ServiceWithAnswers(AnswerId1, AnswerId2);
            var updated = new List<Entity>();
            service.Setup(s => s.Update(It.Is<Entity>(e => e.LogicalName == "qdb_survey_answer")))
                   .Callback<Entity>(e => updated.Add(e));

            new ResponseRetentionStore(service.Object, CustomerLink.Account).Anonymise(ResponseId);

            Assert.Equal(new[] { AnswerId1, AnswerId2 }, updated.Select(e => e.Id).ToArray());
            Assert.All(updated, e => Assert.True(e.Contains("qdb_answer_text") && e["qdb_answer_text"] == null));
        }

        [Fact]
        public void Anonymise_NoAnswers_UpdatesOnlyTheResponse()
        {
            var service = ServiceWithAnswers();
            var answerUpdates = 0;
            service.Setup(s => s.Update(It.Is<Entity>(e => e.LogicalName == "qdb_survey_answer")))
                   .Callback(() => answerUpdates++);

            new ResponseRetentionStore(service.Object, CustomerLink.Account).Anonymise(ResponseId);

            Assert.Equal(0, answerUpdates);
            service.Verify(s => s.Update(It.Is<Entity>(e => e.LogicalName == "qdb_survey_response")), Times.Once());
        }

        [Fact]
        public void FindSubmittedBefore_ReturnsIdsOfMatchingResponses()
        {
            var responseId = Guid.NewGuid();
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { new Entity("qdb_survey_response", responseId) }) { MoreRecords = false });

            var ids = new ResponseRetentionStore(service.Object, CustomerLink.Account)
                .FindSubmittedBefore(new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc));

            Assert.Equal(new[] { responseId }, ids.ToArray());
        }

        [Fact]
        public void FindIdentifiedSubmittedBefore_ContactOrg_AddsNotNullConditionOnContactLookup()
        {
            QueryExpression captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Callback<QueryBase>(q => captured = q as QueryExpression)
                   .Returns(new EntityCollection() { MoreRecords = false });

            new ResponseRetentionStore(service.Object, CustomerLink.Contact)
                .FindIdentifiedSubmittedBefore(new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc));

            Assert.Contains(
                captured.Criteria.Conditions,
                c => c.AttributeName == CustomerLink.Contact.LookupColumn && c.Operator == ConditionOperator.NotNull);
        }

        [Fact]
        public void FindIdentifiedSubmittedBefore_AccountOrg_AddsNotNullConditionOnAccountLookup()
        {
            QueryExpression captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Callback<QueryBase>(q => captured = q as QueryExpression)
                   .Returns(new EntityCollection() { MoreRecords = false });

            new ResponseRetentionStore(service.Object, CustomerLink.Account)
                .FindIdentifiedSubmittedBefore(new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc));

            Assert.Contains(
                captured.Criteria.Conditions,
                c => c.AttributeName == CustomerLink.Account.LookupColumn && c.Operator == ConditionOperator.NotNull);
        }

        /// <summary>
        /// FindAnswers (used by Anonymise) calls RetrieveAll which pages through results.
        /// This test verifies that a second page is consumed if MoreRecords is true.
        /// </summary>
        [Fact]
        public void Anonymise_AnswersSpanTwoPages_UpdatesBothPages()
        {
            var service = new Mock<IOrganizationService>();
            var callCount = 0;
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityNameOf(q) == "qdb_survey_answer")))
                   .Returns(() =>
                   {
                       callCount++;
                       if (callCount == 1) return new EntityCollection(new[] { new Entity("qdb_survey_answer", AnswerId1) }) { MoreRecords = true, PagingCookie = "c1" };
                       return new EntityCollection(new[] { new Entity("qdb_survey_answer", AnswerId2) }) { MoreRecords = false };
                   });
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityNameOf(q) != "qdb_survey_answer")))
                   .Returns(new EntityCollection() { MoreRecords = false });
            var updated = new List<Guid>();
            service.Setup(s => s.Update(It.Is<Entity>(e => e.LogicalName == "qdb_survey_answer")))
                   .Callback<Entity>(e => updated.Add(e.Id));
            service.Setup(s => s.Update(It.Is<Entity>(e => e.LogicalName == "qdb_survey_response")));

            new ResponseRetentionStore(service.Object, CustomerLink.Account).Anonymise(ResponseId);

            Assert.Equal(new[] { AnswerId1, AnswerId2 }, updated.ToArray());
        }
    }

    // ── Data layer: QueryPaging (Priority 5) ─────────────────────────────────
    // Tested through ResponseRetentionStore, which calls RetrieveAll internally.

    public class QueryPagingViaRetentionStoreTests
    {
        [Fact]
        public void FindSubmittedBefore_MultiplePages_ReturnsAllIds()
        {
            var id1 = Guid.NewGuid();
            var id2 = Guid.NewGuid();
            var callCount = 0;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(() =>
                   {
                       callCount++;
                       if (callCount == 1) return new EntityCollection(new[] { new Entity("qdb_survey_response", id1) }) { MoreRecords = true, PagingCookie = "cookie" };
                       return new EntityCollection(new[] { new Entity("qdb_survey_response", id2) }) { MoreRecords = false };
                   });

            var ids = new ResponseRetentionStore(service.Object, CustomerLink.Account)
                .FindSubmittedBefore(new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc));

            Assert.Equal(new[] { id1, id2 }, ids.ToArray());
            Assert.Equal(2, callCount);
        }
    }
}
