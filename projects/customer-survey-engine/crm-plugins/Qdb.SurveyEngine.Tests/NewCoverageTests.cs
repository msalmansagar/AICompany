using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Dispatch;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;
using Qdb.SurveyEngine.Plugins;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    // ── ResponseRetentionStore (Priority 1) ──────────────────────────────────

    /// <summary>
    /// Tests the CRM-backed ResponseRetentionStore against both customer table variants.
    /// The contact path had never run anywhere before these tests (QA risk RISK-01).
    /// </summary>
    public class ResponseRetentionStoreTests
    {
        private static readonly Guid ResponseId = new Guid("11111111-1111-1111-1111-111111111111");
        private static readonly Guid AnswerId1 = new Guid("22222222-2222-2222-2222-222222222222");
        private static readonly Guid AnswerId2 = new Guid("33333333-3333-3333-3333-333333333333");

        // Sets up service.RetrieveMultiple to return the specified answer entities when queried
        // for qdb_survey_answer, and nothing otherwise (paging: MoreRecords = false each time).
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
            var service = ServiceWithAnswers(); // zero answers
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
                .FindSubmittedBefore(DateTime.UtcNow);

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
                .FindIdentifiedSubmittedBefore(DateTime.UtcNow);

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
                .FindIdentifiedSubmittedBefore(DateTime.UtcNow);

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

    // ── ResponseSubmitter extra Close/retry paths (Priority 2) ───────────────

    /// <summary>
    /// Close paths not covered by IntegrationApiTests: invitation deleted between response write
    /// and close, and second TryClose also failing (concurrent double edit).
    /// </summary>
    public class ResponseSubmitterCloseRetryTests
    {
        private const string FormCode = "srv-retry-test";
        private static readonly Guid CustomerId = new Guid("aaaaaaaa-0000-0000-0000-00000000000a");

        private const string MinimalSurveyJson =
            @"{""formCode"":""srv-retry-test"",""tabs"":[{""displayOrder"":1,""sections"":[{""displayOrder"":1,""fields"":[{""schemaName"":""srv_q"",""label"":""Q"",""displayOrder"":1}]}]}]}";

        private const string Answers = @"[{""questionCode"":""srv_q"",""value"":""yes""}]";

        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemoryIntegrationStore _store = new InMemoryIntegrationStore();
        private readonly InvitationRecord _invitation;

        public ResponseSubmitterCloseRetryTests()
        {
            _invitation = new InvitationRecord
            {
                Id = Guid.NewGuid(), CustomerId = CustomerId, SetupId = Guid.NewGuid(),
                FormCode = FormCode, PinnedVersion = 1, LanguageCode = "en",
                Status = InvitationStatus.Pending, ExpiresOn = _pipeline.UtcNow.AddDays(5),
            };
            _store.Invitations[_invitation.Id] = _invitation;
            _store.RuntimeJson[$"{FormCode}|1|en"] = MinimalSurveyJson;
        }

        private IntegrationDependencies Deps() => new IntegrationDependencies
        {
            Invitations = _store, Forms = _store, Responses = _store, Config = _pipeline, Clock = _pipeline,
        };

        private void Submit() =>
            new ResponseSubmitter(Deps(), new InvitationAccess(Deps())).Submit(
                new InvitationRequest { InvitationId = _invitation.Id, CallerCustomerId = CustomerId }, Answers);

        [Fact]
        public void Submit_InvitationGoneAfterResponseWrite_IsNotFound()
        {
            // First TryClose fails (row-version mismatch); FindById returns null (invitation deleted mid-flight)
            _store.CloseConflicts.Enqueue(() => _store.Invitations.Remove(_invitation.Id));

            var ex = Assert.Throws<SurveyApiException>((Action)Submit);

            Assert.Equal(SurveyApiException.NotFound, ex.Code);
        }

        [Fact]
        public void Submit_SecondTryCloseAlsoFails_IsAlreadySubmitted()
        {
            // Both TryClose attempts fail (double concurrent modification of the same row)
            _store.CloseConflicts.Enqueue(() => { }); // first fails; invitation still open
            _store.CloseConflicts.Enqueue(() => { }); // second also fails

            var ex = Assert.Throws<SurveyApiException>((Action)Submit);

            Assert.Equal(SurveyApiException.AlreadySubmitted, ex.Code);
        }

        [Fact]
        public void Submit_InvitationGoneAfterResponseWrite_WritesNothingToClosures()
        {
            _store.CloseConflicts.Enqueue(() => _store.Invitations.Remove(_invitation.Id));

            Assert.Throws<SurveyApiException>((Action)Submit);

            Assert.Empty(_store.Closures);
        }
    }

    // ── Exact boundary tests (Priority 3) ────────────────────────────────────

    public class FatigueBoundaryTests
    {
        private const string Table = "qdb_payment_authorization_ticket";
        private const string FormCode = "srv-fatigue-boundary";
        private static readonly Guid CustomerId = new Guid("22222222-2222-2222-2222-222222222222");

        private readonly InMemorySurveyStore _store = new InMemorySurveyStore();

        public FatigueBoundaryTests()
        {
            _store.ActiveSource = new SurveySource(Guid.NewGuid(), Table, new SourceFields { CustomerLookup = "qdb_customer_name" });
            _store.Triggers.Add(new SurveyTrigger
            {
                Id = Guid.NewGuid(), Kind = TriggerKind.Event, StatusValues = CodeList.Parse("100000005"),
                Setup = new SurveySetup { Id = Guid.NewGuid(), FormCode = FormCode },
            });
            _store.PublishedVersions[FormCode + "|en"] = 1;
            _store.CurrentRecord = new RecordChange { OldStatus = "1", NewStatus = "100000005", CustomerId = CustomerId };
            // Settings default: FatigueMinDays = 30
        }

        private void Handle() =>
            SurveyTriggerService.Compose(_store.AsDependencies())
                .Handle(new RecordChange { Message = ChangeMessage.Update, TableLogicalName = Table, RecordId = Guid.NewGuid() });

        /// <summary>
        /// FatiguePolicy.BlockingSince returns nowUtc - FatigueMinDays.
        /// HasSentInvitationSince checks i.GeneratedOn >= sinceUtc.
        /// An invitation sent at exactly nowUtc - 30 days equals sinceUtc → still inside the window.
        /// </summary>
        [Fact]
        public void Handle_SurveyedExactlyAtFatigueMinDaysAgo_IsStillFatigued()
        {
            _store.Invitations.Add(new InvitationDraft
            {
                CustomerId = CustomerId,
                GeneratedOn = _store.UtcNow.AddDays(-_store.Settings.FatigueMinDays), // exactly at boundary
                Status = InvitationStatus.Pending,
                DedupeKey = "boundary-earlier",
            });

            Handle();

            Assert.Equal(SuppressionReason.Fatigue, _store.Suppressions.Single().Reason);
        }

        [Fact]
        public void Handle_SurveyedOneDayBeforeFatigueMinDaysAgo_FatigueIsOver()
        {
            _store.Invitations.Add(new InvitationDraft
            {
                CustomerId = CustomerId,
                GeneratedOn = _store.UtcNow.AddDays(-(_store.Settings.FatigueMinDays + 1)),
                Status = InvitationStatus.Pending,
                DedupeKey = "boundary-earlier",
            });

            Handle();

            // Should generate a new invitation with no fatigue suppression
            Assert.Equal(2, _store.Invitations.Count);
            Assert.Empty(_store.Suppressions);
        }

        [Fact]
        public void Handle_PostponedInvitationWithinFatigueWindow_IsNotCountedAsFatigue()
        {
            // Postponed invitations were never sent, so they do not block the customer
            _store.Invitations.Add(new InvitationDraft
            {
                CustomerId = CustomerId,
                GeneratedOn = _store.UtcNow.AddDays(-1),
                Status = InvitationStatus.Postponed,
                DedupeKey = "postponed-earlier",
            });

            Handle();

            Assert.Empty(_store.Suppressions);
        }
    }

    public class TokenExpiryBoundaryTests
    {
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemoryIntegrationStore _store = new InMemoryIntegrationStore();
        private readonly InvitationRecord _invitation;

        public TokenExpiryBoundaryTests()
        {
            _invitation = new InvitationRecord
            {
                Id = Guid.NewGuid(), CustomerId = Guid.NewGuid(), SetupId = Guid.NewGuid(),
                FormCode = "test", PinnedVersion = 1, LanguageCode = "en",
                Status = InvitationStatus.Pending,
            };
            _store.Invitations[_invitation.Id] = _invitation;
        }

        private InvitationAccess Access() =>
            new InvitationAccess(new IntegrationDependencies { Invitations = _store, Forms = _store, Responses = _store, Config = _pipeline, Clock = _pipeline });

        private string CodeOf(Action action) => Assert.Throws<SurveyApiException>(action).Code;

        private InvitationRequest ForCustomer() =>
            new InvitationRequest { InvitationId = _invitation.Id, CallerCustomerId = _invitation.CustomerId };

        /// <summary>
        /// EnsureOpen uses ExpiresOn.Value &lt;= UtcNow: when ExpiresOn equals UtcNow exactly,
        /// the invitation has just expired (boundary inclusive on the expired side).
        /// </summary>
        [Fact]
        public void EnsureOpen_ExpiresOnEqualsNow_IsExpired()
        {
            _invitation.ExpiresOn = _pipeline.UtcNow; // exactly now

            Assert.Equal(SurveyApiException.Expired, CodeOf(() => Access().Open(ForCustomer())));
        }

        [Fact]
        public void EnsureOpen_ExpiresOnOneSecondAfterNow_IsStillOpen()
        {
            _invitation.ExpiresOn = _pipeline.UtcNow.AddSeconds(1);

            var result = Access().Open(ForCustomer());

            Assert.Equal(_invitation.Id, result.Id);
        }

        [Fact]
        public void EnsureOpen_NoExpiresOn_NeverExpires()
        {
            _invitation.ExpiresOn = null;

            var result = Access().Open(ForCustomer());

            Assert.Equal(_invitation.Id, result.Id);
        }

        [Fact]
        public void EnsureOpen_TokenUsedOnSet_IsAlreadySubmitted()
        {
            _invitation.TokenUsedOn = _pipeline.UtcNow.AddDays(-1);

            Assert.Equal(SurveyApiException.AlreadySubmitted, CodeOf(() => Access().Open(ForCustomer())));
        }
    }

    public class MilestoneCounterFetchXmlTests
    {
        private static MilestoneCountQuery QueryWithNoTypeField() => new MilestoneCountQuery
        {
            Source = new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", new SourceFields
            {
                CustomerLookup = "qdb_customer_name",
                Type = null, // no type field configured
            }),
            Settings = new MilestoneSettings
            {
                StatusValues = CodeList.Parse("100000005"),
                TypeValues = CodeList.Parse("751090000"), // type values set but no field to apply them to
            },
            CustomerId = new Guid("22222222-2222-2222-2222-222222222222"),
        };

        /// <summary>
        /// When the source has no type field, type values must be ignored even if set,
        /// because there is no column to filter on.
        /// </summary>
        [Fact]
        public void BuildFetchXml_TypeValuesSetButNoTypeField_OmitsTheTypeFilter()
        {
            var fetch = MilestoneCounter.BuildFetchXml(QueryWithNoTypeField());

            // The type IN condition must not appear, but the status IN must still appear
            Assert.DoesNotContain("<value>751090000</value>", fetch);
            Assert.Contains("<value>100000005</value>", fetch);
        }

        [Fact]
        public void BuildFetchXml_TypeValuesSetButWhitespaceTypeField_OmitsTheTypeFilter()
        {
            var query = QueryWithNoTypeField();
            var fields = new SourceFields { CustomerLookup = "qdb_customer_name", Type = "   " };
            query = new MilestoneCountQuery
            {
                Source = new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", fields),
                Settings = new MilestoneSettings { StatusValues = CodeList.Parse("100000005"), TypeValues = CodeList.Parse("751090000") },
                CustomerId = new Guid("22222222-2222-2222-2222-222222222222"),
            };

            var fetch = MilestoneCounter.BuildFetchXml(query);

            Assert.DoesNotContain("<value>751090000</value>", fetch);
        }

        [Fact]
        public void BuildFetchXml_NoCreatedBefore_OmitsUpperDateLimit()
        {
            var query = QueryWithNoTypeField();
            query.CreatedBefore = null;

            var fetch = MilestoneCounter.BuildFetchXml(query);

            Assert.DoesNotContain("operator='lt'", fetch);
        }

        [Fact]
        public void CountQualifying_AliasedValuePresent_ConvertsToInt()
        {
            var entity = new Entity("qdb_cheque_clearing") { ["qualifying"] = new AliasedValue("qdb_cheque_clearing", "qdb_cheque_clearingid", 7) };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { entity }));

            var query = new MilestoneCountQuery
            {
                Source = new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", new SourceFields { CustomerLookup = "qdb_customer_name" }),
                Settings = new MilestoneSettings { StatusValues = CodeList.Parse("100000005") },
                CustomerId = Guid.NewGuid(),
            };

            Assert.Equal(7, new MilestoneCounter(service.Object).CountQualifying(query));
        }

        [Fact]
        public void CountQualifying_EmptyResultSet_ReturnsZero()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection());

            var query = new MilestoneCountQuery
            {
                Source = new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", new SourceFields { CustomerLookup = "qdb_customer_name" }),
                Settings = new MilestoneSettings { StatusValues = CodeList.Parse("100000005") },
                CustomerId = Guid.NewGuid(),
            };

            Assert.Equal(0, new MilestoneCounter(service.Object).CountQualifying(query));
        }

        /// <summary>
        /// FetchXml.Escape is internal, but its output reaches BuildFetchXml's return value.
        /// A table or customer id containing an XML special character verifies the escaping path.
        /// </summary>
        [Fact]
        public void BuildFetchXml_XmlSpecialCharInCustomerId_IsXmlEscapedInOutput()
        {
            // A GUID never has special chars, but we can inject them through a table name that the
            // source stores. We use an apostrophe in the status value to trigger XML escaping.
            var query = new MilestoneCountQuery
            {
                Source = new SurveySource(Guid.NewGuid(), "qdb_cheque_clearing", new SourceFields { CustomerLookup = "qdb_customer_name" }),
                Settings = new MilestoneSettings { StatusValues = CodeList.Parse("val&ue") },
                CustomerId = Guid.NewGuid(),
            };

            var fetch = MilestoneCounter.BuildFetchXml(query);

            // The ampersand must be encoded, not left raw
            Assert.Contains("val&amp;ue", fetch);
            Assert.DoesNotContain("<value>val&ue</value>", fetch);
        }
    }

    // ── Suppression recording when log write throws (Priority 4) ─────────────

    public class SuppressionRecorderExceptionTests
    {
        private const string Table = "qdb_cheque_clearing";
        private static readonly Guid CustomerId = new Guid("22222222-2222-2222-2222-222222222222");

        private static TriggerEvaluation Evaluation()
        {
            var source = new SurveySource(Guid.NewGuid(), Table, new SourceFields());
            var trigger = new SurveyTrigger { Id = Guid.NewGuid(), Setup = new SurveySetup { Id = Guid.NewGuid() } };
            var change = new RecordChange { CustomerId = CustomerId, TableLogicalName = Table };
            return new TriggerEvaluation(trigger, source, change);
        }

        /// <summary>
        /// NFR-CSE-001: the suppression log exists for auditability. When the write throws, the
        /// exception must propagate — silently swallowing it would create an invisible gap in the audit trail.
        /// </summary>
        [Fact]
        public void Record_SuppressionLogThrows_PropagatesTheException()
        {
            var store = new InMemorySurveyStore();
            var deps = store.AsDependencies();
            deps.Suppressions = new ThrowingSuppressionLog();
            var recorder = new SuppressionRecorder(deps);

            Assert.Throws<InvalidOperationException>(() =>
                recorder.Record(Evaluation(), SuppressionReason.FormNotPublished, "test"));
        }

        [Fact]
        public void Record_Succeeds_WritesEntryWithAllFields()
        {
            var store = new InMemorySurveyStore();
            var evaluation = Evaluation();
            new SuppressionRecorder(store.AsDependencies())
                .Record(evaluation, SuppressionReason.Fatigue, "test detail");

            var entry = store.Suppressions.Single();
            Assert.Equal(SuppressionReason.Fatigue, entry.Reason);
            Assert.Equal(CustomerId, entry.CustomerId);
            Assert.Equal(evaluation.Trigger.Id, entry.TriggerId);
            Assert.Equal(evaluation.Trigger.Setup.Id, entry.SetupId);
        }

        [Fact]
        public void Record_Succeeds_TracesTheSuppression()
        {
            var store = new InMemorySurveyStore();
            new SuppressionRecorder(store.AsDependencies())
                .Record(Evaluation(), SuppressionReason.Fatigue, "some reason");

            Assert.Contains(store.TraceLines, t => t.Contains("Fatigue") && t.Contains("some reason"));
        }

        private sealed class ThrowingSuppressionLog : ISuppressionLog
        {
            public void Write(SuppressionEntry entry) => throw new InvalidOperationException("Storage unavailable");
        }
    }

    // ── Data layer: QueryPaging (Priority 5) ─────────────────────────────────
    // Tested through ResponseRetentionStore, which calls RetrieveAll internally.

    public class QueryPagingVinaRetentionStoreTests
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
                .FindSubmittedBefore(DateTime.UtcNow);

            Assert.Equal(new[] { id1, id2 }, ids.ToArray());
            Assert.Equal(2, callCount);
        }
    }

    // ── Plugin entry points (Priority 5) ─────────────────────────────────────

    public class RunDueSurveysPluginInputTests
    {
        private static IPluginExecutionContext ContextWith(object runDate)
        {
            var inputs = new ParameterCollection();
            if (runDate != null) inputs[RunDueSurveysPlugin.RunDateParameter] = runDate;
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InputParameters).Returns(inputs);
            return context.Object;
        }

        [Fact]
        public void ReadRunDate_BlankRunDateInput_IsToday()
        {
            var today = new DateTime(2026, 11, 13, 22, 30, 0, DateTimeKind.Utc);

            Assert.Equal(today.Date, RunDueSurveysPlugin.ReadRunDate(ContextWith("   "), today));
        }

        [Fact]
        public void ReadRunDate_ValidDate_IsUsed()
        {
            Assert.Equal(new DateTime(2026, 11, 13), RunDueSurveysPlugin.ReadRunDate(ContextWith("2026-11-13"), DateTime.UtcNow));
        }
    }

    public class SourceActivationPluginBaseTests
    {
        private static IPluginExecutionContext ContextWith(object sourceId)
        {
            var inputs = new ParameterCollection();
            if (sourceId != null) inputs[SourceActivationPluginBase.SourceIdParameter] = sourceId;
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InputParameters).Returns(inputs);
            return context.Object;
        }

        [Fact]
        public void ReadSourceId_ValidGuid_ReturnsIt()
        {
            var id = Guid.NewGuid();

            Assert.Equal(id, SourceActivationPluginBase.ReadSourceId(ContextWith(id)));
        }

        [Fact]
        public void ReadSourceId_MissingParameter_ThrowsInvalidPlugin()
        {
            Assert.Throws<InvalidPluginExecutionException>(() =>
                SourceActivationPluginBase.ReadSourceId(ContextWith(null)));
        }

        [Fact]
        public void ReadSourceId_EmptyGuid_ThrowsInvalidPlugin()
        {
            Assert.Throws<InvalidPluginExecutionException>(() =>
                SourceActivationPluginBase.ReadSourceId(ContextWith(Guid.Empty)));
        }
    }

    // ── PluginCall input helpers (Priority 5) ────────────────────────────────

    public class PluginCallTests
    {
        private static PluginCall CallWith(string parameterName, object value)
        {
            var inputs = new ParameterCollection();
            if (value != null) inputs[parameterName] = value;
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InputParameters).Returns(inputs);
            context.SetupGet(c => c.OutputParameters).Returns(new ParameterCollection());
            return new PluginCall(context.Object, new IntegrationDependencies());
        }

        [Fact]
        public void Text_AbsentParameter_IsNull()
        {
            Assert.Null(CallWith("Missing", null).Text("Missing"));
        }

        [Fact]
        public void Text_PresentButWhitespace_IsNull()
        {
            Assert.Null(CallWith("Token", "   ").Text("Token"));
        }

        [Fact]
        public void Text_PresentWithPadding_IsTrimmed()
        {
            Assert.Equal("hello", CallWith("Token", "  hello  ").Text("Token"));
        }

        [Fact]
        public void OptionalGuid_ValidGuid_ReturnsIt()
        {
            var id = Guid.NewGuid();

            Assert.Equal(id, CallWith("InvitationId", id.ToString("D")).OptionalGuid("InvitationId"));
        }

        [Fact]
        public void OptionalGuid_Absent_IsNull()
        {
            Assert.Null(CallWith("InvitationId", null).OptionalGuid("InvitationId"));
        }

        [Fact]
        public void Output_SetsTheOutputParameter()
        {
            var outputs = new ParameterCollection();
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InputParameters).Returns(new ParameterCollection());
            context.SetupGet(c => c.OutputParameters).Returns(outputs);
            var call = new PluginCall(context.Object, new IntegrationDependencies());

            call.Output("ResponseId", "abc");

            Assert.Equal("abc", outputs["ResponseId"]);
        }
    }

    // ── AdministratorCheck (Priority 5) ──────────────────────────────────────

    public class AdministratorCheckTests
    {
        [Fact]
        public void IsSystemAdministrator_HasDirectRole_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.SetupSequence(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { new Entity("role") }))
                   .Returns(new EntityCollection());

            Assert.True(new AdministratorCheck(service.Object).IsSystemAdministrator(Guid.NewGuid()));
        }

        [Fact]
        public void IsSystemAdministrator_NoDirectRoleHasTeamRole_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.SetupSequence(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection())
                   .Returns(new EntityCollection(new[] { new Entity("role") }));

            Assert.True(new AdministratorCheck(service.Object).IsSystemAdministrator(Guid.NewGuid()));
        }

        [Fact]
        public void IsSystemAdministrator_NeitherDirectNorTeamRole_IsFalse()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection());

            Assert.False(new AdministratorCheck(service.Object).IsSystemAdministrator(Guid.NewGuid()));
        }
    }

    // ── RetentionPass: budget exhausted mid-run ───────────────────────────────

    public class RetentionPassBudgetTests
    {
        [Fact]
        public void Run_BudgetExhaustedBeforeFirstResponse_SaysNotComplete()
        {
            var pipeline = new InMemorySurveyStore { UtcNow = new DateTime(2026, 11, 10, 9, 0, 0, DateTimeKind.Utc) };
            pipeline.Settings.RetentionDays = 365;
            pipeline.Settings.RetentionMode = RetentionMode.Delete;
            var store = new InMemorySchedulingStore(pipeline);
            store.Responses[Guid.NewGuid()] = Tuple.Create(pipeline.UtcNow.AddDays(-400), true);
            store.Responses[Guid.NewGuid()] = Tuple.Create(pipeline.UtcNow.AddDays(-500), true);

            // A zero-allowance budget is exhausted immediately
            var result = RunDueSurveysService.Compose(store.AsDependencies())
                .Run(pipeline.UtcNow, new RunBudget(pipeline, TimeSpan.Zero)).Retention;

            Assert.False(result.IsComplete);
            Assert.Empty(store.Deleted);
        }
    }

    // ── InvitationAccess edge cases (Priority 5) ─────────────────────────────

    public class InvitationAccessEdgeCaseTests
    {
        private readonly InMemorySurveyStore _pipeline = new InMemorySurveyStore();
        private readonly InMemoryIntegrationStore _store = new InMemoryIntegrationStore();

        private InvitationAccess Access() =>
            new InvitationAccess(new IntegrationDependencies { Invitations = _store, Forms = _store, Responses = _store, Config = _pipeline, Clock = _pipeline });

        private string CodeOf(Action action) => Assert.Throws<SurveyApiException>(action).Code;

        [Fact]
        public void Open_NullRequest_ThrowsBadRequest()
        {
            Assert.Equal(SurveyApiException.BadRequest, CodeOf(() => Access().Open(null)));
        }

        [Fact]
        public void Open_InvitationIdWithoutCallerCustomerId_ThrowsBadRequest()
        {
            var inv = new InvitationRecord
            {
                Id = Guid.NewGuid(), CustomerId = Guid.NewGuid(), SetupId = Guid.NewGuid(),
                FormCode = "test", PinnedVersion = 1, LanguageCode = "en",
                Status = InvitationStatus.Pending,
            };
            _store.Invitations[inv.Id] = inv;

            Assert.Equal(SurveyApiException.BadRequest, CodeOf(() =>
                Access().Open(new InvitationRequest { InvitationId = inv.Id })));
        }

        [Fact]
        public void FindByToken_SecureLinkDisabled_IsForbidden()
        {
            _pipeline.Settings.SecureLinkEnabled = false;

            Assert.Equal(SurveyApiException.Forbidden, CodeOf(() => Access().FindByToken("any-token")));
        }

        [Fact]
        public void FindByToken_UnknownToken_IsNotFound()
        {
            _pipeline.Settings.SecureLinkEnabled = true;

            Assert.Equal(SurveyApiException.NotFound, CodeOf(() => Access().FindByToken("unknown")));
        }
    }

    // ── RetentionResult default state ─────────────────────────────────────────

    public class RetentionResultDefaultTests
    {
        [Fact]
        public void RetentionResult_Default_IsComplete()
        {
            Assert.True(new RetentionResult().IsComplete);
        }

        [Fact]
        public void Run_NoRetentionPeriodAndNoMode_RetentionIsCompleteWithDefaultOutcome()
        {
            var pipeline = new InMemorySurveyStore();
            var store = new InMemorySchedulingStore(pipeline);

            var result = RunDueSurveysService.Compose(store.AsDependencies())
                .Run(pipeline.UtcNow, new RunBudget(pipeline, TimeSpan.FromMinutes(1))).Retention;

            Assert.True(result.IsComplete);
        }
    }

    // ── CustomerLinkReader and Reference extension ────────────────────────────

    public class CustomerLinkExtensionTests
    {
        [Fact]
        public void Reference_AccountLink_ReturnsAccountEntityReference()
        {
            var customerId = Guid.NewGuid();

            var reference = CustomerLink.Account.Reference(customerId);

            Assert.Equal("account", reference.LogicalName);
            Assert.Equal(customerId, reference.Id);
        }

        [Fact]
        public void Reference_ContactLink_ReturnsContactEntityReference()
        {
            var customerId = Guid.NewGuid();

            var reference = CustomerLink.Contact.Reference(customerId);

            Assert.Equal("contact", reference.LogicalName);
            Assert.Equal(customerId, reference.Id);
        }

        [Fact]
        public void CustomerIdOf_AccountLink_ReturnsIdFromAccountLookup()
        {
            var id = Guid.NewGuid();
            var row = new Entity("qdb_survey_invitation") { [CustomerLink.Account.LookupColumn] = new EntityReference("account", id) };

            Assert.Equal(id, CustomerLink.Account.CustomerIdOf(row));
        }

        [Fact]
        public void CustomerIdOf_ContactLink_ReadsContactLookupNotAccountLookup()
        {
            var contactId = Guid.NewGuid();
            var row = new Entity("qdb_survey_invitation")
            {
                [CustomerLink.Account.LookupColumn] = new EntityReference("account", Guid.NewGuid()),
                [CustomerLink.Contact.LookupColumn] = new EntityReference("contact", contactId),
            };

            Assert.Equal(contactId, CustomerLink.Contact.CustomerIdOf(row));
        }
    }

    // ── InvitationRepository additional paths (Priority 5) ───────────────────

    public class InvitationRepositoryContactOrgTests
    {
        [Fact]
        public void TryCreate_ContactOrg_WritesTheCutomerAsContactLookup()
        {
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());
            var customerId = Guid.NewGuid();

            new InvitationRepository(service.Object, CustomerLink.Contact).TryCreate(new InvitationDraft { CustomerId = customerId, DedupeKey = "k", Name = "n" });

            Assert.Equal(new EntityReference("contact", customerId), written.GetAttributeValue<EntityReference>("qdb_customer_contact_id"));
        }

        [Fact]
        public void HasSentInvitationSince_ContactOrg_QueryReturnsTrue()
        {
            var customerId = Guid.NewGuid();
            var row = new Entity("qdb_survey_invitation", Guid.NewGuid());
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            Assert.True(new InvitationRepository(service.Object, CustomerLink.Contact).HasSentInvitationSince(customerId, DateTime.UtcNow.AddDays(-1)));
        }
    }

    // ── WeightedScoring ResponseScore boundary (Priority 5) ──────────────────

    public class ResponseScoreBoundaryTests
    {
        [Fact]
        public void Percent_ZeroMaximum_IsNull()
        {
            var score = new ResponseScore(0m, 0m);

            Assert.Null(score.Percent);
        }

        [Fact]
        public void Percent_NonZeroMaximum_IsRoundedToTwoDecimals()
        {
            var score = new ResponseScore(1m, 3m); // 33.333...%

            Assert.Equal(33.33m, score.Percent.Value);
        }

        [Fact]
        public void Of_AllSkippedAnswers_ProducesZeroTotalAndMaximum()
        {
            // Skipped answers have no Score set
            var answers = new[] { new AnswerRow { AnswerText = "skipped" } };

            var score = ResponseScore.Of(answers);

            Assert.Equal(0m, score.Total);
            Assert.Equal(0m, score.Maximum);
        }
    }

    // ── CachedRenderCacheReader (cache hit path) ──────────────────────────────

    public class CachedRenderCacheReaderTests
    {
        [Fact]
        public void FindActivePublishedVersion_CalledTwice_QueriesInnerOnce()
        {
            var calls = 0;
            var inner = new Mock<IRenderCacheReader>();
            inner.Setup(r => r.FindActivePublishedVersion("form", "en"))
                 .Callback(() => calls++)
                 .Returns(5);
            var cache = new CachedRenderCacheReader(inner.Object);

            var v1 = cache.FindActivePublishedVersion("form", "en");
            var v2 = cache.FindActivePublishedVersion("form", "en");

            Assert.Equal(5, v1);
            Assert.Equal(5, v2);
            Assert.Equal(1, calls); // second call uses the cache
        }

        [Fact]
        public void FindActivePublishedVersion_NullResultIsCached()
        {
            var calls = 0;
            var inner = new Mock<IRenderCacheReader>();
            inner.Setup(r => r.FindActivePublishedVersion(It.IsAny<string>(), It.IsAny<string>()))
                 .Callback(() => calls++)
                 .Returns((int?)null);
            var cache = new CachedRenderCacheReader(inner.Object);

            cache.FindActivePublishedVersion("x", "en");
            cache.FindActivePublishedVersion("x", "en");

            Assert.Equal(1, calls);
        }

        [Fact]
        public void FindActivePublishedVersion_DifferentLanguages_AreInSeparateCacheEntries()
        {
            var inner = new Mock<IRenderCacheReader>();
            inner.Setup(r => r.FindActivePublishedVersion("form", "en")).Returns(1);
            inner.Setup(r => r.FindActivePublishedVersion("form", "ar")).Returns(2);
            var cache = new CachedRenderCacheReader(inner.Object);

            Assert.Equal(1, cache.FindActivePublishedVersion("form", "en"));
            Assert.Equal(2, cache.FindActivePublishedVersion("form", "ar"));
        }
    }

    // ── RenderCacheReader ─────────────────────────────────────────────────────

    public class RenderCacheReaderTests
    {
        [Fact]
        public void FindActivePublishedVersion_NoCacheRow_IsNull()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection());

            Assert.Null(new RenderCacheReader(service.Object).FindActivePublishedVersion("form", "en"));
        }

        [Fact]
        public void FindActivePublishedVersion_CacheRowPresent_ReturnsVersion()
        {
            var row = new Entity("qdb_form_render_cache") { ["qdb_published_version"] = 7 };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            Assert.Equal(7, new RenderCacheReader(service.Object).FindActivePublishedVersion("form", "en"));
        }
    }

    // ── ActivationSourceStore ─────────────────────────────────────────────────

    public class ActivationSourceStoreTests
    {
        [Fact]
        public void Find_NoRow_IsNull()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Null(new ActivationSourceStore(service.Object).Find(Guid.NewGuid()));
        }

        [Fact]
        public void Find_Row_MapsAllFields()
        {
            var id = Guid.NewGuid();
            var row = new Entity("qdb_survey_source", id)
            {
                ["qdb_name"] = "Test Source",
                ["qdb_table_logical_name"] = "qdb_cheque_clearing",
                ["qdb_status_field"] = "mystatusfield",
                ["qdb_type_field"] = "mytypefield",
                ["qdb_step_registration_json"] = null,
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var source = new ActivationSourceStore(service.Object).Find(Guid.NewGuid());

            Assert.Equal("Test Source", source.Name);
            Assert.Equal("mystatusfield", source.StatusField);
            Assert.Equal("mytypefield", source.TypeField);
        }

        [Fact]
        public void Find_NullStatusField_DefaultsToStatuscode()
        {
            var row = new Entity("qdb_survey_source", Guid.NewGuid());
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var source = new ActivationSourceStore(service.Object).Find(Guid.NewGuid());

            Assert.Equal("statuscode", source.StatusField);
        }

        [Fact]
        public void GetTriggerCodes_MilestoneTrigger_UsesTheMilestoneColumns()
        {
            var row = new Entity("qdb_survey_trigger", Guid.NewGuid())
            {
                ["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.Milestone),
                ["qdb_milestone_status_values"] = "100000005",
                ["qdb_milestone_type_values"] = "7",
                ["qdb_status_values"] = "wrong",
                ["qdb_type_values"] = "wrong",
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var codes = new ActivationSourceStore(service.Object).GetTriggerCodes(Guid.NewGuid());

            Assert.Equal(new[] { "100000005" }, codes[0].StatusCodes);
            Assert.Equal(new[] { "7" }, codes[0].TypeCodes);
        }

        [Fact]
        public void GetTriggerCodes_EventTrigger_UsesEventColumns()
        {
            var row = new Entity("qdb_survey_trigger", Guid.NewGuid())
            {
                ["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.Event),
                ["qdb_status_values"] = "100000003",
                ["qdb_type_values"] = "9",
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var codes = new ActivationSourceStore(service.Object).GetTriggerCodes(Guid.NewGuid());

            Assert.Equal(new[] { "100000003" }, codes[0].StatusCodes);
        }

        [Fact]
        public void GetTriggerCodes_NullTriggerName_UsesIdAsName()
        {
            var triggerId = Guid.NewGuid();
            var row = new Entity("qdb_survey_trigger", triggerId)
            {
                ["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.Event),
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var codes = new ActivationSourceStore(service.Object).GetTriggerCodes(Guid.NewGuid());

            Assert.Equal(triggerId.ToString("D"), codes[0].TriggerName);
        }

        [Fact]
        public void SaveActivation_EmptyRegistrations_NullsTheJson()
        {
            Entity updated = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Update(It.IsAny<Entity>())).Callback<Entity>(e => updated = e);
            var id = Guid.NewGuid();

            new ActivationSourceStore(service.Object).SaveActivation(id, true, new System.Collections.Generic.List<Activation.StepRegistration>());

            Assert.True(updated.GetAttributeValue<bool?>("qdb_is_active") == true);
            Assert.Null(updated.GetAttributeValue<string>("qdb_step_registration_json"));
        }
    }

    // ── SurveyConfigRepository ────────────────────────────────────────────────

    public class SurveyConfigRepositoryTests
    {
        [Fact]
        public void FindActiveSource_NoRow_IsNull()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Null(new SurveyConfigRepository(service.Object).FindActiveSource("qdb_cheque"));
        }

        [Fact]
        public void FindActiveSource_Row_IsReturned()
        {
            var id = Guid.NewGuid();
            var row = new Entity("qdb_survey_source", id)
            {
                ["qdb_table_logical_name"] = "qdb_cheque_clearing",
                ["qdb_customer_lookup_field"] = "qdb_cif_no",
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var source = new SurveyConfigRepository(service.Object).FindActiveSource("qdb_cheque_clearing");

            Assert.Equal("qdb_cheque_clearing", source.TableLogicalName);
        }

        [Fact]
        public void GetSettings_NoRow_ReturnsDefaults()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            var settings = new SurveyConfigRepository(service.Object).GetSettings();

            Assert.False(settings.SecureLinkEnabled);
            Assert.Null(settings.RetentionDays);
        }

        [Fact]
        public void GetSettings_Row_MapsAllFields()
        {
            var row = new Entity("qdb_survey_settings", Guid.NewGuid())
            {
                ["qdb_language_field"] = "qdb_language",
                ["qdb_default_language"] = "ar",
                ["qdb_fatigue_min_days"] = 15,
                ["qdb_retention_days"] = 365,
                ["qdb_retention_mode"] = new OptionSetValue((int)RetentionMode.Anonymise),
                ["qdb_securelink_enabled"] = true,
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var settings = new SurveyConfigRepository(service.Object).GetSettings();

            Assert.Equal("ar", settings.DefaultLanguage);
            Assert.Equal(15, settings.FatigueMinDays);
            Assert.Equal(365, settings.RetentionDays);
            Assert.Equal(RetentionMode.Anonymise, settings.RetentionMode);
            Assert.True(settings.SecureLinkEnabled);
        }
    }

    // ── SuppressionLogWriter ──────────────────────────────────────────────────

    public class SuppressionLogWriterTests
    {
        [Fact]
        public void Write_WithCustomerId_SetsCustomerLookup()
        {
            var customerId = Guid.NewGuid();
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            new SuppressionLogWriter(service.Object, CustomerLink.Account).Write(new SuppressionEntry
            {
                Reason = SuppressionReason.Fatigue, CustomerId = customerId, SetupId = Guid.NewGuid(),
                LoggedOn = DateTime.UtcNow,
            });

            Assert.True(written.Contains(CustomerLink.Account.LookupColumn));
        }

        [Fact]
        public void Write_NullCustomerId_DoesNotSetCustomerLookup()
        {
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            new SuppressionLogWriter(service.Object, CustomerLink.Account).Write(new SuppressionEntry
            {
                Reason = SuppressionReason.Fatigue, CustomerId = null, SetupId = Guid.NewGuid(),
                LoggedOn = DateTime.UtcNow,
            });

            Assert.False(written.Contains(CustomerLink.Account.LookupColumn));
        }

        [Fact]
        public void Write_EmptyTriggerId_OmitsTriggerLookup()
        {
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            new SuppressionLogWriter(service.Object, CustomerLink.Account).Write(new SuppressionEntry
            {
                Reason = SuppressionReason.Fatigue, SetupId = Guid.NewGuid(), TriggerId = Guid.Empty,
                LoggedOn = DateTime.UtcNow,
            });

            Assert.False(written.Contains("qdb_survey_trigger_id"));
        }

        [Fact]
        public void Write_NonEmptyTriggerId_SetsTriggerLookup()
        {
            var triggerId = Guid.NewGuid();
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            new SuppressionLogWriter(service.Object, CustomerLink.Account).Write(new SuppressionEntry
            {
                Reason = SuppressionReason.Fatigue, SetupId = Guid.NewGuid(), TriggerId = triggerId,
                LoggedOn = DateTime.UtcNow,
            });

            Assert.Equal(triggerId, written.GetAttributeValue<EntityReference>("qdb_survey_trigger_id")?.Id);
        }
    }

    // ── ResponseWriter ────────────────────────────────────────────────────────

    public class ResponseWriterTests
    {
        private static InvitationRecord Invitation() => new InvitationRecord
        {
            Id = Guid.NewGuid(), CustomerId = Guid.NewGuid(), SetupId = Guid.NewGuid(),
            FormCode = "test", PinnedVersion = 1, LanguageCode = "en",
        };

        private static ResponseDraft DraftWithoutScore() => new ResponseDraft
        {
            Invitation = Invitation(), AnswersJson = "[]", SubmittedOn = DateTime.UtcNow,
            Answers = new AnswerRow[0], Score = null,
        };

        [Fact]
        public void Create_DuplicateAlternateKey_ReturnsIsDuplicate()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80060892) };
            service.Setup(s => s.Create(It.IsAny<Entity>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(fault));

            var result = new ResponseWriter(service.Object, CustomerLink.Account).Create(DraftWithoutScore());

            Assert.True(result.IsDuplicate);
        }

        [Fact]
        public void Create_DuplicateRecordError_ReturnsIsDuplicate()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80040237) };
            service.Setup(s => s.Create(It.IsAny<Entity>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(fault));

            var result = new ResponseWriter(service.Object, CustomerLink.Account).Create(DraftWithoutScore());

            Assert.True(result.IsDuplicate);
        }

        [Fact]
        public void Create_WithScore_SetsScoreColumns()
        {
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.Is<Entity>(e => e.LogicalName == "qdb_survey_response")))
                   .Callback<Entity>(e => written = e).Returns(Guid.NewGuid());
            service.Setup(s => s.Create(It.Is<Entity>(e => e.LogicalName == "qdb_survey_answer"))).Returns(Guid.NewGuid());

            var draft = DraftWithoutScore();
            draft.Score = new ResponseScore(5m, 10m);
            new ResponseWriter(service.Object, CustomerLink.Account).Create(draft);

            Assert.Equal(5m, written.GetAttributeValue<decimal?>("qdb_score_total"));
            Assert.Equal(10m, written.GetAttributeValue<decimal?>("qdb_score_max"));
        }

        [Fact]
        public void Create_NoScore_OmitsScoreColumns()
        {
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.Is<Entity>(e => e.LogicalName == "qdb_survey_response")))
                   .Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            new ResponseWriter(service.Object, CustomerLink.Account).Create(DraftWithoutScore());

            Assert.False(written.Contains("qdb_score_total"));
        }

        [Fact]
        public void Create_AnswerWithScore_SetsAnswerPointsColumns()
        {
            Entity answerWritten = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.Is<Entity>(e => e.LogicalName == "qdb_survey_response"))).Returns(Guid.NewGuid());
            service.Setup(s => s.Create(It.Is<Entity>(e => e.LogicalName == "qdb_survey_answer")))
                   .Callback<Entity>(e => answerWritten = e).Returns(Guid.NewGuid());

            var draft = DraftWithoutScore();
            draft.Answers = new[] { new AnswerRow { QuestionCode = "q1", Score = new AnswerScore(2m, 4m, 10m) } };
            new ResponseWriter(service.Object, CustomerLink.Account).Create(draft);

            Assert.Equal(2m, answerWritten.GetAttributeValue<decimal?>("qdb_points"));
        }

        [Fact]
        public void Create_AnswerWithoutScore_OmitsAnswerPointsColumns()
        {
            Entity answerWritten = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.Is<Entity>(e => e.LogicalName == "qdb_survey_response"))).Returns(Guid.NewGuid());
            service.Setup(s => s.Create(It.Is<Entity>(e => e.LogicalName == "qdb_survey_answer")))
                   .Callback<Entity>(e => answerWritten = e).Returns(Guid.NewGuid());

            var draft = DraftWithoutScore();
            draft.Answers = new[] { new AnswerRow { QuestionCode = "q1", Score = null } };
            new ResponseWriter(service.Object, CustomerLink.Account).Create(draft);

            Assert.False(answerWritten.Contains("qdb_points"));
        }
    }

    // ── PublishedFormReader ───────────────────────────────────────────────────

    public class PublishedFormReaderTests
    {
        [Fact]
        public void FindRuntimeJson_NoRow_IsNull()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Null(new PublishedFormReader(service.Object).FindRuntimeJson("form", 1, "en"));
        }

        [Fact]
        public void FindRuntimeJson_NullStoredValue_IsNull()
        {
            var row = new Entity("qdb_form_render_cache") { ["qdb_runtime_json"] = null };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            Assert.Null(new PublishedFormReader(service.Object).FindRuntimeJson("form", 1, "en"));
        }

        [Fact]
        public void FindRuntimeJson_UncompressedRow_ReturnsRaw()
        {
            var row = new Entity("qdb_form_render_cache")
            {
                ["qdb_runtime_json"] = "{\"formCode\":\"test\"}",
                ["qdb_is_compressed"] = false,
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            Assert.Equal("{\"formCode\":\"test\"}", new PublishedFormReader(service.Object).FindRuntimeJson("form", 1, "en"));
        }

        [Fact]
        public void FindRuntimeJson_CompressedRow_IsDecompressed()
        {
            // Compress a known string and store it as base64
            var originalJson = "{\"formCode\":\"compressed\"}";
            using (var ms = new System.IO.MemoryStream())
            {
                using (var gz = new System.IO.Compression.GZipStream(ms, System.IO.Compression.CompressionMode.Compress, true))
                using (var writer = new System.IO.StreamWriter(gz, System.Text.Encoding.UTF8))
                    writer.Write(originalJson);
                var base64 = Convert.ToBase64String(ms.ToArray());
                var row = new Entity("qdb_form_render_cache")
                {
                    ["qdb_runtime_json"] = base64,
                    ["qdb_is_compressed"] = true,
                };
                var service = new Mock<IOrganizationService>();
                service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                       .Returns(new EntityCollection(new[] { row }));

                Assert.Equal(originalJson, new PublishedFormReader(service.Object).FindRuntimeJson("form", 1, "en"));
            }
        }

        [Fact]
        public void Decompress_RoundTrip_IsIdenticalToOriginal()
        {
            var original = "some json content أبج"; // includes Arabic
            using (var ms = new System.IO.MemoryStream())
            {
                using (var gz = new System.IO.Compression.GZipStream(ms, System.IO.Compression.CompressionMode.Compress, true))
                using (var writer = new System.IO.StreamWriter(gz, System.Text.Encoding.UTF8))
                    writer.Write(original);
                var base64 = Convert.ToBase64String(ms.ToArray());
                Assert.Equal(original, PublishedFormReader.Decompress(base64));
            }
        }
    }

    // ── IntegrationInvitationStore ────────────────────────────────────────────

    public class IntegrationInvitationStoreTests
    {
        private static IntegrationInvitationStore Store(IOrganizationService service) =>
            new IntegrationInvitationStore(service, CustomerLink.Account);

        [Fact]
        public void FindById_NoRow_IsNull()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Null(Store(service.Object).FindById(Guid.NewGuid()));
        }

        [Fact]
        public void FindByTokenHash_Row_MapsCustomerId()
        {
            var customerId = Guid.NewGuid();
            var row = new Entity("qdb_survey_invitation", Guid.NewGuid())
            {
                [CustomerLink.Account.LookupColumn] = new EntityReference("account", customerId),
                ["qdb_form_code"] = "test",
                ["qdb_status"] = new OptionSetValue((int)InvitationStatus.Pending),
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var inv = Store(service.Object).FindByTokenHash("hash");

            Assert.Equal(customerId, inv.CustomerId);
        }

        [Fact]
        public void TryClose_RowVersionMismatch_ReturnsFalse()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80060882) };
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(fault));

            var result = Store(service.Object).TryClose(new InvitationClosure
            {
                Invitation = new InvitationRecord { Id = Guid.NewGuid() },
                SubmittedOn = DateTime.UtcNow,
                WasOpenedByToken = false,
            });

            Assert.False(result);
        }

        [Fact]
        public void TryClose_Success_ReturnsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Returns(new OrganizationResponse());

            var result = Store(service.Object).TryClose(new InvitationClosure
            {
                Invitation = new InvitationRecord { Id = Guid.NewGuid() },
                SubmittedOn = DateTime.UtcNow,
                WasOpenedByToken = false,
            });

            Assert.True(result);
        }

        [Fact]
        public void TryClose_WasOpenedByToken_SetsTokenUsedOn()
        {
            OrganizationRequest captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Callback<OrganizationRequest>(r => captured = r)
                   .Returns(new OrganizationResponse());
            var submittedOn = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

            Store(service.Object).TryClose(new InvitationClosure
            {
                Invitation = new InvitationRecord { Id = Guid.NewGuid() },
                SubmittedOn = submittedOn,
                WasOpenedByToken = true,
            });

            var target = ((Microsoft.Xrm.Sdk.Messages.UpdateRequest)captured).Target;
            Assert.Equal(submittedOn, target.GetAttributeValue<DateTime?>("qdb_token_used_on"));
        }
    }

    // ── PostponedInvitationStore ──────────────────────────────────────────────

    public class PostponedInvitationStoreTests
    {
        private static PostponedInvitationStore Store(IOrganizationService service) =>
            new PostponedInvitationStore(service, CustomerLink.Account);

        private static PostponedInvitation Invitation() => new PostponedInvitation
        {
            Id = Guid.NewGuid(),
            CustomerId = Guid.NewGuid(),
            Setup = new SurveySetup { Id = Guid.NewGuid() },
            RowVersion = "1",
        };

        [Fact]
        public void TryRelease_RowVersionMismatch_ReturnsFalse()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80060882) };
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(fault));

            Assert.False(Store(service.Object).TryRelease(Invitation(), DateTime.UtcNow));
        }

        [Fact]
        public void TryRelease_Success_SetsStatusToPending()
        {
            OrganizationRequest captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Callback<OrganizationRequest>(r => captured = r)
                   .Returns(new OrganizationResponse());

            Store(service.Object).TryRelease(Invitation(), DateTime.UtcNow);

            var target = ((Microsoft.Xrm.Sdk.Messages.UpdateRequest)captured).Target;
            Assert.Equal((int)InvitationStatus.Pending, target.GetAttributeValue<OptionSetValue>("qdb_status")?.Value);
        }

        [Fact]
        public void TryDiscard_Success_SetsStatusToDiscarded()
        {
            OrganizationRequest captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Callback<OrganizationRequest>(r => captured = r)
                   .Returns(new OrganizationResponse());

            Store(service.Object).TryDiscard(Invitation());

            var target = ((Microsoft.Xrm.Sdk.Messages.UpdateRequest)captured).Target;
            Assert.Equal((int)InvitationStatus.Discarded, target.GetAttributeValue<OptionSetValue>("qdb_status")?.Value);
        }
    }

    // ── OptionCodeReader ──────────────────────────────────────────────────────

    public class OptionCodeReaderTests
    {
        [Fact]
        public void ReadCodes_BooleanAttribute_ReturnsTrueAndFalse()
        {
            var service = new Mock<IOrganizationService>();
            var metadata = new BooleanAttributeMetadata();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Returns(new RetrieveAttributeResponse { Results = new ParameterCollection { { "AttributeMetadata", metadata } } });

            var codes = new OptionCodeReader(service.Object).ReadCodes("account", "new_flag");

            Assert.Equal(new[] { "true", "false" }, codes);
        }

        [Fact]
        public void ReadCodes_OtherAttributeType_IsNull()
        {
            var service = new Mock<IOrganizationService>();
            var metadata = new StringAttributeMetadata();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Returns(new RetrieveAttributeResponse { Results = new ParameterCollection { { "AttributeMetadata", metadata } } });

            Assert.Null(new OptionCodeReader(service.Object).ReadCodes("account", "name"));
        }
    }

    // ── CustomerLanguageReader ────────────────────────────────────────────────

    public class CustomerLanguageReaderTests
    {
        [Fact]
        public void ReadLanguageValue_FieldAbsent_IsNull()
        {
            var customer = new Entity("account", Guid.NewGuid());
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Retrieve(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<ColumnSet>()))
                   .Returns(customer);

            Assert.Null(new CustomerLanguageReader(service.Object, CustomerLink.Account).ReadLanguageValue(Guid.NewGuid(), "qdb_language"));
        }

        [Fact]
        public void ReadLanguageValue_OptionSetValue_ReturnsIntCode()
        {
            var customer = new Entity("account", Guid.NewGuid()) { ["qdb_language"] = new OptionSetValue(1025) };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Retrieve(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<ColumnSet>()))
                   .Returns(customer);

            var result = new CustomerLanguageReader(service.Object, CustomerLink.Account).ReadLanguageValue(Guid.NewGuid(), "qdb_language");

            Assert.Equal(1025, result);
        }

        [Fact]
        public void ReadLanguageValue_StringValue_ReturnsString()
        {
            var customer = new Entity("account", Guid.NewGuid()) { ["qdb_language"] = "ar" };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Retrieve(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<ColumnSet>()))
                   .Returns(customer);

            var result = new CustomerLanguageReader(service.Object, CustomerLink.Account).ReadLanguageValue(Guid.NewGuid(), "qdb_language");

            Assert.Equal("ar", result);
        }
    }

    // ── DispatchStore ─────────────────────────────────────────────────────────

    public class DispatchStoreTests
    {
        [Fact]
        public void FindInvitation_NoRow_IsNull()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Null(new DispatchStore(service.Object, CustomerLink.Account).FindInvitation(Guid.NewGuid()));
        }

        [Fact]
        public void FindInvitation_ValidRecordId_ParsedAsGuid()
        {
            var recordId = Guid.NewGuid();
            var row = new Entity("qdb_survey_invitation", Guid.NewGuid())
            {
                ["qdb_source_record_id"] = recordId.ToString("D"),
                ["qdb_status"] = new OptionSetValue((int)InvitationStatus.Pending),
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var inv = new DispatchStore(service.Object, CustomerLink.Account).FindInvitation(Guid.NewGuid());

            Assert.Equal(recordId, inv.SourceRecordId);
        }

        [Fact]
        public void FindInvitation_InvalidRecordId_IsNull()
        {
            var row = new Entity("qdb_survey_invitation", Guid.NewGuid())
            {
                ["qdb_source_record_id"] = "not-a-guid",
                ["qdb_status"] = new OptionSetValue((int)InvitationStatus.Pending),
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var inv = new DispatchStore(service.Object, CustomerLink.Account).FindInvitation(Guid.NewGuid());

            Assert.Null(inv.SourceRecordId);
        }

        [Fact]
        public void ReadContact_MissingPhoneField_MobileIsNull()
        {
            var customer = new Entity("account", Guid.NewGuid()) { ["emailaddress1"] = "test@test.com" };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Retrieve(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<ColumnSet>()))
                   .Returns(customer);

            var contact = new DispatchStore(service.Object, CustomerLink.Account).ReadContact(Guid.NewGuid(), null);

            Assert.Equal("test@test.com", contact.Email);
            Assert.Null(contact.Mobile);
        }

        [Fact]
        public void ReadContact_PhoneFieldFaultException_MobileIsNull()
        {
            var emailCustomer = new Entity("account", Guid.NewGuid()) { ["emailaddress1"] = "a@b.com" };
            var service = new Mock<IOrganizationService>();
            var callCount = 0;
            service.Setup(s => s.Retrieve(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<ColumnSet>()))
                   .Returns(() =>
                   {
                       callCount++;
                       if (callCount == 1) return emailCustomer;
                       throw new System.ServiceModel.FaultException<OrganizationServiceFault>(new OrganizationServiceFault());
                   });

            var contact = new DispatchStore(service.Object, CustomerLink.Account).ReadContact(Guid.NewGuid(), "mobile_phone");

            Assert.Null(contact.Mobile);
        }

        [Fact]
        public void GetSettings_NoRow_ReturnsDefaults()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            var settings = new DispatchStore(service.Object, CustomerLink.Account).GetSettings();

            Assert.False(settings.SecureLinkEnabled);
            Assert.Null(settings.EmailSenderQueueId);
        }

        [Fact]
        public void FindActiveSmsConfig_NoRow_IsNull()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Null(new DispatchStore(service.Object, CustomerLink.Account).FindActiveSmsConfig());
        }

        [Fact]
        public void FindActiveSmsConfig_Row_MapsAllFields()
        {
            var row = new Entity("qdb_survey_sms_config", Guid.NewGuid())
            {
                ["qdb_sms_table_logical_name"] = "letter",
                ["qdb_recipient_field"] = "msdyn_to",
                ["qdb_message_field"] = "msdyn_description",
                ["qdb_customer_link_field"] = "msdyn_customer",
                ["qdb_customer_phone_field"] = "mobilephone",
                ["qdb_static_columns_json"] = null,
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var config = new DispatchStore(service.Object, CustomerLink.Account).FindActiveSmsConfig();

            Assert.Equal("letter", config.TableLogicalName);
            Assert.Equal("msdyn_to", config.RecipientField);
        }
    }

    // ── ScheduledInvitationReader ─────────────────────────────────────────────

    public class ScheduledInvitationReaderTests
    {
        [Fact]
        public void GetDedupeKeys_ReturnsDistinctKeys()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[]
                   {
                       new Entity("qdb_survey_invitation") { ["qdb_dedupe_key"] = "k1" },
                       new Entity("qdb_survey_invitation") { ["qdb_dedupe_key"] = "k2" },
                   }) { MoreRecords = false });

            var keys = new ScheduledInvitationReader(service.Object).GetDedupeKeys(Guid.NewGuid(), "2026-Q1");

            Assert.Contains("k1", keys);
            Assert.Contains("k2", keys);
            Assert.Equal(2, keys.Count);
        }
    }

    // ── ScheduledTriggerRepository ────────────────────────────────────────────

    public class ScheduledTriggerRepositoryTests
    {
        [Fact]
        public void GetActiveScheduledTriggers_NoRows_IsEmpty()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            var triggers = new ScheduledTriggerRepository(service.Object).GetActiveScheduledTriggers();

            Assert.Empty(triggers);
        }

        [Fact]
        public void GetActiveScheduledTriggers_Row_MapsSchedulePeriod()
        {
            var setupId = Guid.NewGuid();
            var row = new Entity("qdb_survey_trigger", Guid.NewGuid())
            {
                ["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.Scheduled),
                ["qdb_schedule_period"] = new OptionSetValue((int)SchedulePeriod.Monthly),
                ["setup.qdb_survey_setupid"] = new AliasedValue("qdb_survey_setup", "qdb_survey_setupid", setupId),
                ["setup.qdb_form_code"] = new AliasedValue("qdb_survey_setup", "qdb_form_code", "srv-test"),
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var triggers = new ScheduledTriggerRepository(service.Object).GetActiveScheduledTriggers();

            Assert.Single(triggers);
            Assert.Equal(SchedulePeriod.Monthly, triggers[0].Schedule.Period);
        }

        [Fact]
        public void GetActiveScheduledTriggers_NoPopulationSource_PopulationSourceIsNull()
        {
            var setupId = Guid.NewGuid();
            var row = new Entity("qdb_survey_trigger", Guid.NewGuid())
            {
                ["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.Scheduled),
                ["qdb_schedule_period"] = new OptionSetValue((int)SchedulePeriod.Monthly),
                ["setup.qdb_survey_setupid"] = new AliasedValue("qdb_survey_setup", "qdb_survey_setupid", setupId),
                ["setup.qdb_form_code"] = new AliasedValue("qdb_survey_setup", "qdb_form_code", "srv-test"),
            };
            // No population source columns → MapPopulationSource returns null
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { row }));

            var trigger = new ScheduledTriggerRepository(service.Object).GetActiveScheduledTriggers()[0];

            Assert.Null(trigger.Schedule.PopulationSource);
        }
    }

    // ── InvitationRepository extra paths ─────────────────────────────────────

    public class InvitationRepositoryExtraTests
    {
        [Fact]
        public void ExistsWithDedupeKey_RowPresent_IsTrue()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new[] { new Entity("qdb_survey_invitation") }));

            Assert.True(new InvitationRepository(service.Object, CustomerLink.Account).ExistsWithDedupeKey("k"));
        }

        [Fact]
        public void ExistsWithDedupeKey_NoRow_IsFalse()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.False(new InvitationRepository(service.Object, CustomerLink.Account).ExistsWithDedupeKey("k"));
        }

        [Fact]
        public void GetLastMilestoneIndex_NoRow_IsZero()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection());

            Assert.Equal(0, new InvitationRepository(service.Object, CustomerLink.Account).GetLastMilestoneIndex(Guid.NewGuid(), Guid.NewGuid()));
        }

        [Fact]
        public void TryCreate_DuplicateRecordError_ReturnsFalse()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80040237) };
            service.Setup(s => s.Create(It.IsAny<Entity>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(fault));

            Assert.False(new InvitationRepository(service.Object, CustomerLink.Account).TryCreate(new InvitationDraft { DedupeKey = "k", Name = "n" }));
        }

        [Fact]
        public void TryCreate_OtherFault_IsRethrown()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80040220) };
            service.Setup(s => s.Create(It.IsAny<Entity>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(fault));

            Assert.Throws<System.ServiceModel.FaultException<OrganizationServiceFault>>(() =>
                new InvitationRepository(service.Object, CustomerLink.Account).TryCreate(new InvitationDraft { DedupeKey = "k", Name = "n" }));
        }
    }

    // ── IntegrationPluginBase.Execute (null check) ────────────────────────────

    public class IntegrationPluginBaseNullCheckTests
    {
        private sealed class StubPlugin : IntegrationPluginBase
        {
            protected override void Run(PluginCall call) { }
        }

        [Fact]
        public void Execute_NullServiceProvider_ThrowsInvalidPlugin()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => new StubPlugin().Execute(null));
        }
    }

    // ── StepRegistry ─────────────────────────────────────────────────────────

    public class StepRegistryTests
    {
        private const string UpdateMessage = "Update";
        private const string CreateMessage = "Create";
        private const string Table = "qdb_cheque_clearing";
        private const string StatusField = "statuscode";

        // Sets up service to answer SDK metadata lookups for message, filter and plugin type.
        private static Mock<IOrganizationService> ServiceWithSdk(
            Guid messageId, Guid filterId, Guid pluginTypeId, Guid? stepId = null, Guid? preImageId = null)
        {
            var service = new Mock<IOrganizationService>(MockBehavior.Loose);
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessage")))
                   .Returns(new EntityCollection(new[] { new Entity("sdkmessage", messageId) }));
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessagefilter")))
                   .Returns(filterId != Guid.Empty
                       ? new EntityCollection(new[] { new Entity("sdkmessagefilter", filterId) })
                       : new EntityCollection());
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "plugintype")))
                   .Returns(new EntityCollection(new[] { new Entity("plugintype", pluginTypeId) }));
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessageprocessingstep")))
                   .Returns(stepId.HasValue
                       ? new EntityCollection(new[] { new Entity("sdkmessageprocessingstep", stepId.Value) })
                       : new EntityCollection());
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessageprocessingstepimage")))
                   .Returns(preImageId.HasValue
                       ? new EntityCollection(new[] { new Entity("sdkmessageprocessingstepimage", preImageId.Value) })
                       : new EntityCollection());
            return service;
        }

        private static string EntityName(QueryBase q) => (q as QueryExpression)?.EntityName ?? string.Empty;

        [Fact]
        public void StepName_UpdateSpec_IncludesTableAndMessage()
        {
            var spec = new StepSpec(UpdateMessage, Table, StatusField);
            var name = StepRegistry.StepName(spec);
            Assert.Contains(Table, name);
            Assert.Contains(UpdateMessage, name);
            Assert.Contains(StepRegistry.PluginTypeName, name);
        }

        [Fact]
        public void SupportsMessage_FilterExists_IsTrue()
        {
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
            Assert.True(new StepRegistry(service.Object).SupportsMessage(Table, UpdateMessage));
        }

        [Fact]
        public void SupportsMessage_NoFilter_IsFalse()
        {
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.Empty, Guid.NewGuid());
            Assert.False(new StepRegistry(service.Object).SupportsMessage(Table, UpdateMessage));
        }

        [Fact]
        public void Find_NoStep_IsNull()
        {
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), stepId: null);
            var spec = new StepSpec(UpdateMessage, Table, StatusField);
            Assert.Null(new StepRegistry(service.Object).Find(spec));
        }

        [Fact]
        public void Find_StepWithNoPreImage_PreImageAttributesIsNull()
        {
            var stepId = Guid.NewGuid();
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), stepId: stepId, preImageId: null);
            var row = new Entity("sdkmessageprocessingstep", stepId) { ["statecode"] = new OptionSetValue(0) };
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessageprocessingstep")))
                   .Returns(new EntityCollection(new[] { row }));

            var spec = new StepSpec(UpdateMessage, Table, StatusField);
            var step = new StepRegistry(service.Object).Find(spec);

            Assert.NotNull(step);
            Assert.True(step.IsEnabled);
            Assert.Null(step.PreImageAttributes);
        }

        [Fact]
        public void Find_StepWithPreImage_PreImageAttributesAreReturned()
        {
            var stepId = Guid.NewGuid();
            var preImageId = Guid.NewGuid();
            var step = new Entity("sdkmessageprocessingstep", stepId) { ["statecode"] = new OptionSetValue(1) };
            var preImage = new Entity("sdkmessageprocessingstepimage", preImageId) { ["attributes"] = "statuscode,qdb_type" };
            var service = new Mock<IOrganizationService>(MockBehavior.Loose);
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessage")))
                   .Returns(new EntityCollection(new[] { new Entity("sdkmessage", Guid.NewGuid()) }));
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessageprocessingstep")))
                   .Returns(new EntityCollection(new[] { step }));
            service.Setup(s => s.RetrieveMultiple(It.Is<QueryBase>(q => EntityName(q) == "sdkmessageprocessingstepimage")))
                   .Returns(new EntityCollection(new[] { preImage }));

            var registered = new StepRegistry(service.Object).Find(new StepSpec(UpdateMessage, Table, StatusField));

            Assert.Equal("statuscode,qdb_type", registered.PreImageAttributes);
            Assert.False(registered.IsEnabled); // statecode = 1 = disabled
        }

        [Fact]
        public void Create_UpdateStep_CreatesStepAndPreImage()
        {
            var messageId = Guid.NewGuid();
            var filterId = Guid.NewGuid();
            var pluginTypeId = Guid.NewGuid();
            var service = ServiceWithSdk(messageId, filterId, pluginTypeId);
            service.Setup(s => s.Create(It.IsAny<Entity>())).Returns(Guid.NewGuid());

            var stepId = new StepRegistry(service.Object).Create(new StepSpec(UpdateMessage, Table, StatusField));

            Assert.NotEqual(Guid.Empty, stepId);
            service.Verify(s => s.Create(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstep")), Times.Once());
            service.Verify(s => s.Create(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstepimage")), Times.Once());
        }

        [Fact]
        public void Create_CreateStep_DoesNotCreatePreImage()
        {
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
            service.Setup(s => s.Create(It.IsAny<Entity>())).Returns(Guid.NewGuid());

            new StepRegistry(service.Object).Create(new StepSpec(CreateMessage, Table, StatusField));

            // Create message → no filtering attributes → no pre-image
            service.Verify(s => s.Create(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstepimage")), Times.Never());
        }

        [Fact]
        public void Reconfigure_NoPreImage_CreatesNewPreImage()
        {
            var stepId = Guid.NewGuid();
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), stepId: null, preImageId: null);
            service.Setup(s => s.Update(It.IsAny<Entity>()));
            service.Setup(s => s.Create(It.IsAny<Entity>())).Returns(Guid.NewGuid());

            new StepRegistry(service.Object).Reconfigure(stepId, new StepSpec(UpdateMessage, Table, StatusField));

            service.Verify(s => s.Create(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstepimage")), Times.Once());
        }

        [Fact]
        public void Reconfigure_ExistingPreImage_UpdatesIt()
        {
            var stepId = Guid.NewGuid();
            var preImageId = Guid.NewGuid();
            var service = ServiceWithSdk(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), stepId: null, preImageId: preImageId);
            service.Setup(s => s.Update(It.IsAny<Entity>()));

            new StepRegistry(service.Object).Reconfigure(stepId, new StepSpec(UpdateMessage, Table, StatusField));

            service.Verify(s => s.Update(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstep")), Times.Once());
            service.Verify(s => s.Update(It.Is<Entity>(e => e.LogicalName == "sdkmessageprocessingstepimage")), Times.Once());
            service.Verify(s => s.Create(It.IsAny<Entity>()), Times.Never());
        }

        [Fact]
        public void SetEnabled_True_SetsStateToZero()
        {
            OrganizationRequest captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Callback<OrganizationRequest>(r => captured = r)
                   .Returns(new OrganizationResponse());

            new StepRegistry(service.Object).SetEnabled(Guid.NewGuid(), true);

            var req = captured as Microsoft.Crm.Sdk.Messages.SetStateRequest;
            Assert.NotNull(req);
            Assert.Equal(0, req.State.Value);
        }

        [Fact]
        public void SetEnabled_False_SetsStateToOne()
        {
            OrganizationRequest captured = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Callback<OrganizationRequest>(r => captured = r)
                   .Returns(new OrganizationResponse());

            new StepRegistry(service.Object).SetEnabled(Guid.NewGuid(), false);

            var req = captured as Microsoft.Crm.Sdk.Messages.SetStateRequest;
            Assert.NotNull(req);
            Assert.Equal(1, req.State.Value);
        }

        [Fact]
        public void Delete_CallsServiceDelete()
        {
            var service = new Mock<IOrganizationService>();
            var id = Guid.NewGuid();

            new StepRegistry(service.Object).Delete(id);

            service.Verify(s => s.Delete("sdkmessageprocessingstep", id), Times.Once());
        }
    }

    // ── EmailSender ───────────────────────────────────────────────────────────

    public class EmailSenderTests
    {
        [Fact]
        public void Send_Success_IsSent()
        {
            var emailId = Guid.NewGuid();
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Returns(emailId);
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Returns(new OrganizationResponse());

            var result = new EmailSender(service.Object, CustomerLink.Account).Send(new EmailMessage
            {
                SenderQueueId = Guid.NewGuid(), CustomerId = Guid.NewGuid(), InvitationId = Guid.NewGuid(),
                Subject = "Test", HtmlBody = "<p>Hello</p>",
            });

            Assert.True(result.IsSent);
        }

        [Fact]
        public void Send_ServiceFault_IsFailed()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { Message = "SMTP error" };
            service.Setup(s => s.Create(It.IsAny<Entity>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(fault));

            var result = new EmailSender(service.Object, CustomerLink.Account).Send(new EmailMessage
            {
                SenderQueueId = Guid.NewGuid(), CustomerId = Guid.NewGuid(), InvitationId = Guid.NewGuid(),
                Subject = "Test", HtmlBody = "<p>Hello</p>",
            });

            Assert.False(result.IsSent);
            Assert.Contains("SMTP error", result.Failure);
        }

        [Fact]
        public void Send_ContactOrg_UsesContactReference()
        {
            var customerId = Guid.NewGuid();
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Returns(new OrganizationResponse());

            new EmailSender(service.Object, CustomerLink.Contact).Send(new EmailMessage
            {
                SenderQueueId = Guid.NewGuid(), CustomerId = customerId, InvitationId = Guid.NewGuid(),
                Subject = "S", HtmlBody = "B",
            });

            var to = written.GetAttributeValue<EntityCollection>("to")?.Entities?.FirstOrDefault();
            var party = to?.GetAttributeValue<EntityReference>("partyid");
            Assert.Equal("contact", party?.LogicalName);
            Assert.Equal(customerId, party?.Id);
        }
    }

    // ── OptionCodeReader - EnumAttributeMetadata path ─────────────────────────

    public class OptionCodeReaderEnumTests
    {
        [Fact]
        public void ReadCodes_PicklistAttribute_ReturnsOptionValues()
        {
            var optionSet = new OptionSetMetadata();
            optionSet.Options.Add(new OptionMetadata(new Label(), 100000005));
            optionSet.Options.Add(new OptionMetadata(new Label(), 100000006));
            var metadata = new PicklistAttributeMetadata { OptionSet = optionSet };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Returns(new RetrieveAttributeResponse { Results = new ParameterCollection { { "AttributeMetadata", metadata } } });

            var codes = new OptionCodeReader(service.Object).ReadCodes("qdb_cheque_clearing", "statuscode");

            Assert.Contains("100000005", codes);
            Assert.Contains("100000006", codes);
        }

        [Fact]
        public void ReadCodes_OptionWithNullValue_IsExcluded()
        {
            var optionSet = new OptionSetMetadata();
            optionSet.Options.Add(new OptionMetadata(new Label(), 100000005));
            optionSet.Options.Add(new OptionMetadata()); // null value
            var metadata = new PicklistAttributeMetadata { OptionSet = optionSet };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Returns(new RetrieveAttributeResponse { Results = new ParameterCollection { { "AttributeMetadata", metadata } } });

            var codes = new OptionCodeReader(service.Object).ReadCodes("qdb_cheque", "myfield");

            Assert.Single(codes);
        }
    }

    // ── SmsHandOff ────────────────────────────────────────────────────────────

    public class SmsHandOffTests
    {
        private static SmsHandOffConfig Config(string json = null) => new SmsHandOffConfig
        {
            TableLogicalName = "letter",
            RecipientField = "msdyn_to",
            MessageField = "msdyn_description",
            CustomerLinkField = null, // no customer link field → branch not taken
            StaticColumnsJson = json,
        };

        private static SmsMessage Message(string full = "Full text", string shortText = "Short") =>
            new SmsMessage { CustomerId = Guid.NewGuid(), Recipient = "+971500000000", FullText = full, ShortText = shortText };

        // Returns a string attribute metadata with a given MaxLength
        private static OrganizationResponse StringMetadata(int maxLength)
        {
            var meta = new StringAttributeMetadata { MaxLength = maxLength };
            return new RetrieveAttributeResponse { Results = new ParameterCollection { { "AttributeMetadata", meta } } };
        }

        private static OrganizationResponse IntegerMetadata()
        {
            var meta = new IntegerAttributeMetadata();
            return new RetrieveAttributeResponse { Results = new ParameterCollection { { "AttributeMetadata", meta } } };
        }

        [Fact]
        public void Send_NoStaticColumns_CreatesRowAndReturnsSent()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Returns(StringMetadata(1000));
            service.Setup(s => s.Create(It.IsAny<Entity>())).Returns(Guid.NewGuid());

            var result = new SmsHandOff(service.Object, CustomerLink.Account).Send(Config(), Message());

            Assert.True(result.IsSent);
        }

        [Fact]
        public void Send_ServiceFault_ReturnsFailed()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Returns(StringMetadata(1000));
            var fault = new OrganizationServiceFault { Message = "table not found" };
            service.Setup(s => s.Create(It.IsAny<Entity>()))
                   .Throws(new System.ServiceModel.FaultException<OrganizationServiceFault>(fault));

            var result = new SmsHandOff(service.Object, CustomerLink.Account).Send(Config(), Message());

            Assert.False(result.IsSent);
            Assert.Contains("table not found", result.Failure);
        }

        [Fact]
        public void Send_MessageExceedsMaxLength_UsesShortText()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Returns(StringMetadata(5)); // maxLength = 5
            Entity written = null;
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            var msg = Message(full: "This is a long full text that exceeds 5 chars", shortText: "Short");
            new SmsHandOff(service.Object, CustomerLink.Account).Send(Config(), msg);

            Assert.Equal("Short", written.GetAttributeValue<string>("msdyn_description"));
        }

        [Fact]
        public void Send_MessageFitsMaxLength_UsesFullText()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Returns(StringMetadata(1000));
            Entity written = null;
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            var msg = Message(full: "Hi", shortText: "X");
            new SmsHandOff(service.Object, CustomerLink.Account).Send(Config(), msg);

            Assert.Equal("Hi", written.GetAttributeValue<string>("msdyn_description"));
        }

        [Fact]
        public void Send_CustomerLinkFieldSet_SetsLookupOnRow()
        {
            var customerId = Guid.NewGuid();
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Returns(StringMetadata(1000));
            Entity written = null;
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());
            var config = Config();
            config.CustomerLinkField = "regardingobjectid";

            var msg = new SmsMessage { CustomerId = customerId, Recipient = "00", FullText = "X", ShortText = "X" };
            new SmsHandOff(service.Object, CustomerLink.Account).Send(config, msg);

            Assert.True(written.Contains("regardingobjectid"));
        }

        [Fact]
        public void Send_StaticColumnsBadJson_ReturnsFailed()
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Returns(StringMetadata(1000));

            var config = Config("not valid json");
            var result = new SmsHandOff(service.Object, CustomerLink.Account).Send(config, Message());

            Assert.False(result.IsSent);
        }

        [Fact]
        public void Send_StaticColumnsWithIntColumn_ParsesAndSetsValue()
        {
            var service = new Mock<IOrganizationService>();
            var callCount = 0;
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Returns(() =>
                   {
                       callCount++;
                       if (callCount == 1) return StringMetadata(1000); // for the message field FitText call
                       return IntegerMetadata(); // for the static column
                   });
            Entity written = null;
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());

            var config = Config("{\"my_int_col\":\"42\"}");
            new SmsHandOff(service.Object, CustomerLink.Account).Send(config, Message());

            Assert.Equal(42, written.GetAttributeValue<int?>("my_int_col"));
        }

        [Fact]
        public void Send_AttributeRetrieveFaultForStaticColumn_ReturnsFailed()
        {
            var service = new Mock<IOrganizationService>();
            var callCount = 0;
            var fault = new OrganizationServiceFault { Message = "column not found" };
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>()))
                   .Returns(() =>
                   {
                       callCount++;
                       if (callCount == 1) return StringMetadata(1000); // FitText call succeeds
                       throw new System.ServiceModel.FaultException<OrganizationServiceFault>(fault);
                   });

            var config = Config("{\"nonexistent_col\":\"1\"}");
            var result = new SmsHandOff(service.Object, CustomerLink.Account).Send(config, Message());

            Assert.False(result.IsSent);
            Assert.Contains("not found", result.Failure);
        }
    }

    // ── InvitationDispatchPlugin.Execute (null + wrong entity checks) ─────────

    public class InvitationDispatchPluginNullCheckTests
    {
        [Fact]
        public void Execute_NullServiceProvider_ThrowsInvalidPlugin()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => new InvitationDispatchPlugin().Execute(null));
        }

        [Fact]
        public void Execute_WrongEntityName_TracesAndReturns()
        {
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.PrimaryEntityName).Returns("contact"); // not qdb_survey_invitation
            context.SetupGet(c => c.PrimaryEntityId).Returns(Guid.NewGuid());
            context.SetupGet(c => c.MessageName).Returns("Update");
            var tracing = new Mock<ITracingService>();
            var provider = new Mock<IServiceProvider>();
            provider.Setup(p => p.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
            provider.Setup(p => p.GetService(typeof(ITracingService))).Returns(tracing.Object);

            // Should trace and return early without calling the factory
            new InvitationDispatchPlugin().Execute(provider.Object);

            provider.Verify(p => p.GetService(typeof(IOrganizationServiceFactory)), Times.Never);
        }
    }

    // ── TracingServiceTrace ───────────────────────────────────────────────────

    public class TracingServiceTraceTests
    {
        [Fact]
        public void Write_DelegatesToUnderlyingTracingService()
        {
            var traced = new System.Collections.Generic.List<string>();
            var tracing = new Mock<ITracingService>();
            tracing.Setup(t => t.Trace(It.IsAny<string>(), It.IsAny<object[]>()))
                   .Callback<string, object[]>((f, a) => traced.Add(string.Format(f, a)));
            var tracer = new TracingServiceTrace(tracing.Object);

            tracer.Write("Hello world");

            Assert.Contains(traced, m => m.Contains("Hello world"));
        }
    }

    // ── Null-guard constructor tests (covers the throw branch of ?? throw) ─────

    public class NullConstructorGuardTests
    {
        [Fact]
        public void InvitationKey_NullDedupeKeyFirstCtor_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new InvitationKey(null, (int?)null));
        }

        [Fact]
        public void InvitationKey_NullDedupeKeySecondCtor_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new InvitationKey(null, new ScheduledSlot("k", null)));
        }

        [Fact]
        public void InvitationKey_NullSlotSecondCtor_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new InvitationKey("k", (ScheduledSlot)null));
        }

        [Fact]
        public void ScheduledSlot_NullPeriodKey_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new ScheduledSlot(null, null));
        }

        [Fact]
        public void InvitationPlan_NullKey_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new InvitationPlan(DeliveryChoice.Portal, null, "en"));
        }

        [Fact]
        public void SuppressionRecorder_NullDependencies_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new SuppressionRecorder(null));
        }

        [Fact]
        public void ScheduledRun_NullTrigger_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new ScheduledRun(null, DateTime.UtcNow, new SurveySettings()));
        }

        [Fact]
        public void ScheduledRun_NullSettings_Throws()
        {
            var trigger = new SurveyTrigger
            {
                Setup = new SurveySetup(),
                Schedule = new ScheduleSettings { Period = SchedulePeriod.Monthly },
            };
            Assert.Throws<ArgumentNullException>(() => new ScheduledRun(trigger, new DateTime(2026, 2, 1), null));
        }

        [Fact]
        public void ReviewedPeriod_NullKey_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new ReviewedPeriod(DateTime.UtcNow, DateTime.UtcNow.AddDays(1), null));
        }

        [Fact]
        public void SurveySource_NullTableLogicalName_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new SurveySource(Guid.NewGuid(), null, new SourceFields()));
        }

        [Fact]
        public void SurveySource_NullFields_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new SurveySource(Guid.NewGuid(), "contact", null));
        }

        [Fact]
        public void RunBudget_NullClock_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new RunBudget(null, TimeSpan.FromMinutes(1)));
        }

        [Fact]
        public void TracingServiceTrace_NullTracing_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new TracingServiceTrace(null));
        }

        [Fact]
        public void SurveyApiException_NullCode_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new SurveyApiException(null, "detail"));
        }

        [Fact]
        public void PostponedInvitationStore_NullService_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new PostponedInvitationStore(null, CustomerLink.Account));
        }

        [Fact]
        public void PostponedInvitationStore_NullCustomer_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new PostponedInvitationStore(new Mock<IOrganizationService>().Object, null));
        }

        [Fact]
        public void ScheduledTriggerRepository_NullService_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new ScheduledTriggerRepository(null));
        }

        [Fact]
        public void RunDueSurveysService_NullPostponed_Throws()
        {
            // Passes null for all three concrete-class parameters; throws on the first null guard
            Assert.Throws<ArgumentNullException>(() => new RunDueSurveysService(null, null, null));
        }

        [Fact]
        public void RunDueSurveysService_Compose_NullDependencies_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => RunDueSurveysService.Compose(null));
        }

        [Fact]
        public void RunDueSurveysService_Compose_NullPipeline_Throws()
        {
            var deps = new RunDueSurveysDependencies { Pipeline = null };
            Assert.Throws<ArgumentException>(() => RunDueSurveysService.Compose(deps));
        }

        [Fact]
        public void RunDueSurveysService_Compose_NullScheduledTriggers_Throws()
        {
            // Pipeline is populated but ScheduledTriggers is null
            var pipeline = ValidPipeline();
            var deps = new RunDueSurveysDependencies
            {
                Pipeline = pipeline,
                ScheduledTriggers = null,
                Population = new Mock<ICustomerPopulationReader>().Object,
                ScheduledInvitations = new Mock<IScheduledInvitationReader>().Object,
                Postponed = new Mock<IPostponedInvitationStore>().Object,
                Retention = new Mock<IResponseRetentionStore>().Object,
            };
            Assert.Throws<ArgumentException>(() => RunDueSurveysService.Compose(deps));
        }

        private static SurveyTriggerDependencies ValidPipeline()
        {
            var service = new Mock<IOrganizationService>().Object;
            var customer = CustomerLink.Account;
            return new SurveyTriggerDependencies
            {
                Config = new SurveyConfigRepository(service),
                Languages = new CustomerLanguageReader(service, customer),
                RenderCache = new RenderCacheReader(service),
                Invitations = new InvitationRepository(service, customer),
                Suppressions = new SuppressionLogWriter(service, customer),
                Clock = new SystemClock(),
                Trace = new TracingServiceTrace(new Mock<ITracingService>().Object),
            };
        }
    }

    // ── JsonText edge cases ───────────────────────────────────────────────────

    public class JsonTextEdgeCaseTests
    {
        [Fact]
        public void Write_NullValue_ThrowsArgumentNullException()
        {
            Assert.Throws<ArgumentNullException>(() => JsonText.Write(null));
        }

        [Fact]
        public void Read_InvalidJson_ThrowsSurveyApiException()
        {
            Assert.Throws<SurveyApiException>(() => JsonText.Read<Dictionary<string, string>>("{not valid json!!", "Test"));
        }

        [Fact]
        public void Read_NullJson_CoercesToEmptyStringAndThrowsSurveyApiException()
        {
            // Covers the null-coalescing branch: json ?? string.Empty; then empty string fails deserialization.
            Assert.Throws<SurveyApiException>(() => JsonText.Read<string>(null, "Test"));
        }

        [Fact]
        public void Read_ValidJson_DeserializesCorrectly()
        {
            var result = JsonText.Read<Dictionary<string, string>>("{\"key\":\"value\"}", "Test");
            Assert.Equal("value", result["key"]);
        }
    }

    // ── LinkToken edge cases ──────────────────────────────────────────────────

    public class LinkTokenHashEdgeCaseTests
    {
        [Fact]
        public void Hash_NullToken_ThrowsArgumentException()
        {
            Assert.Throws<ArgumentException>(() => LinkToken.Hash(null));
        }

        [Fact]
        public void Hash_WhitespaceToken_ThrowsArgumentException()
        {
            Assert.Throws<ArgumentException>(() => LinkToken.Hash("   "));
        }

        [Fact]
        public void Hash_ValidToken_ReturnsLowercaseHex()
        {
            var token = LinkToken.Generate();
            var hash = LinkToken.Hash(token);

            Assert.Equal(64, hash.Length);
            Assert.True(hash == hash.ToLowerInvariant());
        }
    }

    // ── SurveyTriggerPlugin.ReadChange (public static, no ServiceProvider needed) ──

    public class SurveyTriggerPluginReadChangeTests
    {
        [Fact]
        public void Execute_NullServiceProvider_ThrowsInvalidPlugin()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => new SurveyTriggerPlugin().Execute(null));
        }

        [Fact]
        public void ReadChange_UnknownMessageName_ReturnsNull()
        {
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.MessageName).Returns("Delete");
            context.SetupGet(c => c.PrimaryEntityId).Returns(Guid.NewGuid());
            context.SetupGet(c => c.PrimaryEntityName).Returns("contact");

            var result = SurveyTriggerPlugin.ReadChange(context.Object);

            Assert.Null(result);
        }

        [Fact]
        public void ReadChange_CreateMessageWithEmptyEntityId_ReturnsNull()
        {
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.MessageName).Returns("Create");
            context.SetupGet(c => c.PrimaryEntityId).Returns(Guid.Empty);
            context.SetupGet(c => c.PrimaryEntityName).Returns("contact");

            var result = SurveyTriggerPlugin.ReadChange(context.Object);

            Assert.Null(result);
        }

        [Fact]
        public void ReadChange_UpdateMessageWithValidEntityId_ReturnsRecordChange()
        {
            var recordId = Guid.NewGuid();
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.MessageName).Returns("Update");
            context.SetupGet(c => c.PrimaryEntityId).Returns(recordId);
            context.SetupGet(c => c.PrimaryEntityName).Returns("contact");

            var result = SurveyTriggerPlugin.ReadChange(context.Object);

            Assert.NotNull(result);
            Assert.Equal(ChangeMessage.Update, result.Message);
            Assert.Equal(recordId, result.RecordId);
            Assert.Equal("contact", result.TableLogicalName);
        }
    }

    // ── PostponedInvitationStore.GetPostponed row mapping ─────────────────────

    public class PostponedInvitationStoreGetPostponedTests
    {
        private static readonly string SetupAlias = "setup";

        private static Entity BuildRow(
            Guid invitationId,
            Guid customerId,
            Guid setupId,
            EntityReference triggerRef,
            object isSetupActive,
            string sourceRecordId)
        {
            var row = new Entity("qdb_survey_invitation", invitationId);
            row["qdb_customer_id"] = new EntityReference("account", customerId);
            if (triggerRef != null) row["qdb_survey_trigger_id"] = triggerRef;
            row[SetupAlias + ".qdb_survey_setupid"] = new AliasedValue("qdb_survey_setup", "qdb_survey_setupid", setupId);
            row[SetupAlias + ".qdb_active_from"] = new AliasedValue("qdb_survey_setup", "qdb_active_from", null);
            row[SetupAlias + ".qdb_active_to"] = new AliasedValue("qdb_survey_setup", "qdb_active_to", null);
            if (isSetupActive != null)
                row[SetupAlias + ".qdb_is_active"] = new AliasedValue("qdb_survey_setup", "qdb_is_active", isSetupActive);
            row["qdb_source_table"] = "account";
            if (sourceRecordId != null) row["qdb_source_record_id"] = sourceRecordId;
            row.RowVersion = "v1";
            return row;
        }

        private static Mock<IOrganizationService> ServiceWithRow(Entity row)
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new List<Entity> { row }) { MoreRecords = false });
            return service;
        }

        [Fact]
        public void GetPostponed_RowWithValidGuidSourceRecordAndActiveSetup_MapsCorrectly()
        {
            var invitationId = Guid.NewGuid();
            var customerId = Guid.NewGuid();
            var setupId = Guid.NewGuid();
            var triggerId = Guid.NewGuid();
            var sourceId = Guid.NewGuid();

            var row = BuildRow(invitationId, customerId, setupId,
                new EntityReference("qdb_survey_trigger", triggerId),
                isSetupActive: true,
                sourceRecordId: sourceId.ToString("D"));

            var service = ServiceWithRow(row);
            var result = new PostponedInvitationStore(service.Object, CustomerLink.Account).GetPostponed();

            Assert.Single(result);
            Assert.Equal(customerId, result[0].CustomerId);
            Assert.Equal(triggerId, result[0].TriggerId);
            Assert.Equal(sourceId, result[0].SourceRecordId);
            Assert.True(result[0].IsSetupActive);
        }

        [Fact]
        public void GetPostponed_RowWithInvalidGuidSourceRecordAndNoIsSetupActive_SourceRecordNullAndSetupInactive()
        {
            var invitationId = Guid.NewGuid();
            var customerId = Guid.NewGuid();
            var setupId = Guid.NewGuid();

            // No trigger ref → TriggerId = Guid.Empty; no qdb_is_active → false via null-coalescing
            var row = BuildRow(invitationId, customerId, setupId,
                triggerRef: null,
                isSetupActive: null,
                sourceRecordId: "not-a-valid-guid");

            var service = ServiceWithRow(row);
            var result = new PostponedInvitationStore(service.Object, CustomerLink.Account).GetPostponed();

            Assert.Single(result);
            Assert.Null(result[0].SourceRecordId);
            Assert.Equal(Guid.Empty, result[0].TriggerId);
            Assert.False(result[0].IsSetupActive);
        }
    }

    // ── ScheduledTriggerRepository with population source ─────────────────────

    public class ScheduledTriggerRepositoryWithSourceTests
    {
        private const string SetupAlias = "setup";
        private const string PopulationAlias = "population";

        // SourceColumns from SurveyConfigMapping (internal constant, hardcoded here)
        private static readonly string[] SourceColumns = new[]
        {
            "qdb_table_logical_name", "qdb_customer_lookup_field", "qdb_type_field",
            "qdb_status_field", "qdb_origin_field", "qdb_origin_digital_values",
            "qdb_counts_toward_milestones",
        };

        private static Entity BuildTriggerRow(Guid triggerId, Guid setupId, Guid? sourceId)
        {
            var row = new Entity("qdb_survey_trigger", triggerId);

            // Core trigger columns
            row["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.Scheduled);
            row["qdb_schedule_period"] = new OptionSetValue((int)SchedulePeriod.Monthly);
            row["qdb_schedule_population"] = null;  // → defaults to AllActiveCustomers
            row["createdon"] = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

            // Setup aliased columns
            row[SetupAlias + ".qdb_survey_setupid"] = new AliasedValue("qdb_survey_setup", "qdb_survey_setupid", setupId);
            row[SetupAlias + ".qdb_form_code"] = new AliasedValue("qdb_survey_setup", "qdb_form_code", "FORM-01");
            row[SetupAlias + ".qdb_delivery_digital"] = new AliasedValue("qdb_survey_setup", "qdb_delivery_digital", null);
            row[SetupAlias + ".qdb_delivery_legacy"] = new AliasedValue("qdb_survey_setup", "qdb_delivery_legacy", null);
            row[SetupAlias + ".qdb_active_from"] = new AliasedValue("qdb_survey_setup", "qdb_active_from", null);
            row[SetupAlias + ".qdb_active_to"] = new AliasedValue("qdb_survey_setup", "qdb_active_to", null);
            row[SetupAlias + ".qdb_expiry_days"] = new AliasedValue("qdb_survey_setup", "qdb_expiry_days", null);

            // Population source aliased columns
            if (sourceId.HasValue)
            {
                row[PopulationAlias + ".qdb_survey_sourceid"] = new AliasedValue("qdb_survey_source", "qdb_survey_sourceid", sourceId.Value);
                row[PopulationAlias + ".qdb_table_logical_name"] = new AliasedValue("qdb_survey_source", "qdb_table_logical_name", "account");
                row[PopulationAlias + ".qdb_customer_lookup_field"] = new AliasedValue("qdb_survey_source", "qdb_customer_lookup_field", "accountid");
                row[PopulationAlias + ".qdb_type_field"] = new AliasedValue("qdb_survey_source", "qdb_type_field", null);
                row[PopulationAlias + ".qdb_status_field"] = new AliasedValue("qdb_survey_source", "qdb_status_field", "statuscode");
                row[PopulationAlias + ".qdb_origin_field"] = new AliasedValue("qdb_survey_source", "qdb_origin_field", null);
                row[PopulationAlias + ".qdb_origin_digital_values"] = new AliasedValue("qdb_survey_source", "qdb_origin_digital_values", null);
                row[PopulationAlias + ".qdb_counts_toward_milestones"] = new AliasedValue("qdb_survey_source", "qdb_counts_toward_milestones", null);
            }

            return row;
        }

        [Fact]
        public void GetActiveScheduledTriggers_RowWithPopulationSource_MapsSurveySource()
        {
            var triggerId = Guid.NewGuid();
            var setupId = Guid.NewGuid();
            var sourceId = Guid.NewGuid();

            var row = BuildTriggerRow(triggerId, setupId, sourceId);

            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new List<Entity> { row }) { MoreRecords = false });

            var result = new ScheduledTriggerRepository(service.Object).GetActiveScheduledTriggers();

            Assert.Single(result);
            var trigger = result[0];
            Assert.NotNull(trigger.Schedule.PopulationSource);
            Assert.Equal("account", trigger.Schedule.PopulationSource.TableLogicalName);
            Assert.Equal(sourceId, trigger.Schedule.PopulationSource.Id);
            Assert.Equal(SchedulePopulation.AllActiveCustomers, trigger.Schedule.Population);
        }

        [Fact]
        public void GetActiveScheduledTriggers_RowWithNullPopulationSource_PopulationSourceIsNull()
        {
            var triggerId = Guid.NewGuid();
            var setupId = Guid.NewGuid();

            var row = BuildTriggerRow(triggerId, setupId, sourceId: null);

            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection(new List<Entity> { row }) { MoreRecords = false });

            var result = new ScheduledTriggerRepository(service.Object).GetActiveScheduledTriggers();

            Assert.Single(result);
            Assert.Null(result[0].Schedule.PopulationSource);
        }
    }

    // ── IntegrationPluginBase: SurveyApiException caught path ─────────────────

    public class IntegrationPluginBaseSurveyApiExceptionTests
    {
        // A concrete subclass that always throws SurveyApiException on Run()
        private sealed class RefusingPlugin : IntegrationPluginBase
        {
            protected override void Run(PluginCall call) =>
                throw new SurveyApiException(SurveyApiException.BadRequest, "test refusal");
        }

        [Fact]
        public void Execute_RunThrowsSurveyApiException_WrapsAsInvalidPluginExecution()
        {
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.UserId).Returns(Guid.NewGuid());
            context.SetupGet(c => c.MessageName).Returns("CustomAction");
            context.SetupGet(c => c.InputParameters).Returns(new ParameterCollection());
            context.SetupGet(c => c.OutputParameters).Returns(new ParameterCollection());

            var tracing = new Mock<ITracingService>();

            // CustomerLinkReader.Read calls RetrieveMultiple once
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                   .Returns(new EntityCollection() { MoreRecords = false });

            var factory = new Mock<IOrganizationServiceFactory>();
            factory.Setup(f => f.CreateOrganizationService(It.IsAny<Guid?>()))
                   .Returns(service.Object);

            var provider = new Mock<IServiceProvider>();
            provider.Setup(p => p.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
            provider.Setup(p => p.GetService(typeof(ITracingService))).Returns(tracing.Object);
            provider.Setup(p => p.GetService(typeof(IOrganizationServiceFactory))).Returns(factory.Object);

            var ex = Assert.Throws<InvalidPluginExecutionException>(() => new RefusingPlugin().Execute(provider.Object));

            Assert.Contains("test refusal", ex.Message);
        }
    }

    // ── RunSummary.IsComplete false path ──────────────────────────────────────

    public class RunSummaryIsCompleteTests
    {
        [Fact]
        public void IsComplete_WhenPostponedPassIsIncomplete_ReturnsFalse()
        {
            var postponed = new PostponedReleaseResult { IsComplete = false };
            var scheduled = new ScheduledRunResult { IsComplete = true };
            var retention = new RetentionResult { IsComplete = true };
            var summary = new RunSummary(postponed, scheduled, retention);

            Assert.False(summary.IsComplete);
        }

        [Fact]
        public void IsComplete_WhenAllPassesComplete_ReturnsTrue()
        {
            var summary = new RunSummary(
                new PostponedReleaseResult { IsComplete = true },
                new ScheduledRunResult { IsComplete = true },
                new RetentionResult { IsComplete = true });

            Assert.True(summary.IsComplete);
        }

        [Fact]
        public void ToString_WhenNotComplete_IncludesTimeBudgetMessage()
        {
            var postponed = new PostponedReleaseResult { IsComplete = false };
            var scheduled = new ScheduledRunResult { IsComplete = true };
            var retention = new RetentionResult { IsComplete = true };
            var summary = new RunSummary(postponed, scheduled, retention);

            Assert.Contains("Time budget spent", summary.ToString());
        }
    }

    // ── RunBudget.IsExhausted coverage (both branches) ───────────────────────

    public class RunBudgetExhaustedTests
    {
        [Fact]
        public void IsExhausted_WhenClockIsBeforeDeadline_ReturnsFalse()
        {
            var clock = new Mock<IClock>();
            clock.SetupGet(c => c.UtcNow).Returns(new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc));
            var budget = new RunBudget(clock.Object, TimeSpan.FromHours(1));

            Assert.False(budget.IsExhausted);
        }

        [Fact]
        public void IsExhausted_WhenClockIsAtOrAfterDeadline_ReturnsTrue()
        {
            var clock = new Mock<IClock>();
            // First call (in constructor): sets deadline = now + allowance
            // Second call (in IsExhausted): now = deadline (exhausted)
            var callCount = 0;
            var baseline = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
            clock.SetupGet(c => c.UtcNow).Returns(() =>
            {
                callCount++;
                return callCount == 1 ? baseline : baseline.AddMinutes(1);
            });

            var budget = new RunBudget(clock.Object, TimeSpan.FromSeconds(30));

            Assert.True(budget.IsExhausted);
        }
    }
}
