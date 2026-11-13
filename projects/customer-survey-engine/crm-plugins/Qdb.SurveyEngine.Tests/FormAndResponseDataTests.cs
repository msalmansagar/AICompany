using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
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
            Invitation = Invitation(), AnswersJson = "[]", SubmittedOn = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc),
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
                SubmittedOn = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc),
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
                SubmittedOn = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc),
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
}
