using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.DebtCollection.Plugins.Plugins;
using Qdb.DebtCollection.Plugins.Tests.Infrastructure;
using Xunit;

namespace Qdb.DebtCollection.Plugins.Tests
{
    /// <summary>
    /// One active Collection Case per facility per delinquency episode, where the facility is its
    /// MIS identity: facility number plus source system.
    /// </summary>
    public sealed class ActiveCaseGuardTests
    {
        private const string EntityCase = "qdb_collectioncase";

        // ── Create ────────────────────────────────────────────────────────────────

        [Fact]
        public void Guard_CreateWithNoActiveCaseForFacility_Allows()
        {
            var builder = BuildCreate("123456789", "HL");
            SetupActiveCases(builder);

            var ex = Record.Exception(() => CreateGuard(builder).Guard());

            Assert.Null(ex);
        }

        [Fact]
        public void Guard_CreateWhenFacilityAlreadyHasActiveCase_Throws()
        {
            var builder = BuildCreate("123456789", "HL");
            SetupActiveCases(builder, "HL-123456789-E1");

            var ex = Assert.Throws<InvalidPluginExecutionException>(() => CreateGuard(builder).Guard());

            Assert.Contains("HL-123456789-E1", ex.Message);
            Assert.Contains("HL/123456789", ex.Message);
        }

        [Fact]
        public void Guard_CreateQueriesTheFacilityIdentityAndActiveStateOnly()
        {
            // The same facility number in another source system is another facility: the query must
            // carry both identity columns, and the active state, and nothing about a CRM facility record.
            var builder = BuildCreate("123456789", "BFD");
            QueryExpression captured = null;
            builder.MockService
                .Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Callback<QueryBase>(q => captured = (QueryExpression)q)
                .Returns(new EntityCollection());

            CreateGuard(builder).Guard();

            Assert.NotNull(captured);
            Assert.Equal(EntityCase, captured.EntityName);
            Assert.Contains(captured.Criteria.Conditions, c => c.AttributeName == "qdb_facilitynumber" && (string)c.Values[0] == "123456789");
            Assert.Contains(captured.Criteria.Conditions, c => c.AttributeName == "qdb_facilitysourcesystem" && (string)c.Values[0] == "BFD");
            Assert.Contains(captured.Criteria.Conditions, c => c.AttributeName == "statecode" && (int)c.Values[0] == 0);
            Assert.DoesNotContain(captured.Criteria.Conditions, c => c.AttributeName.Contains("facilityid"));
        }

        [Fact]
        public void Guard_CreateWithoutFacilityIdentity_DoesNothing()
        {
            var target = new Entity(EntityCase);
            target["qdb_casenumber"] = "no-facility";
            var builder = new PluginContextBuilder()
                .WithMessage("Create").WithEntity(EntityCase, Guid.Empty).WithTarget(target).WithEmptyPreImages();

            var ex = Record.Exception(() => CreateGuard(builder).Guard());

            Assert.Null(ex);
            builder.MockService.Verify(s => s.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Never);
        }

        // ── Update ────────────────────────────────────────────────────────────────

        [Fact]
        public void Guard_UpdateReactivatingWhileAnotherCaseIsActive_Throws()
        {
            var builder = BuildReactivation("123456789", "HL");
            SetupActiveCases(builder, "HL-123456789-E2");

            Assert.Throws<InvalidPluginExecutionException>(() => CreateGuard(builder).Guard());
        }

        [Fact]
        public void Guard_UpdateReactivation_ExcludesTheRecordItself()
        {
            var selfId = Guid.NewGuid();
            var builder = BuildReactivation("123456789", "HL", selfId);
            QueryExpression captured = null;
            builder.MockService
                .Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Callback<QueryBase>(q => captured = (QueryExpression)q)
                .Returns(new EntityCollection());

            CreateGuard(builder).Guard();

            Assert.Contains(captured.Criteria.Conditions,
                c => c.AttributeName == "qdb_collectioncaseid" && c.Operator == ConditionOperator.NotEqual && (Guid)c.Values[0] == selfId);
        }

        [Fact]
        public void Guard_UpdateThatDoesNotReactivate_DoesNothing()
        {
            var target = new Entity(EntityCase, Guid.NewGuid());
            target["qdb_remarks"] = "note";
            var builder = new PluginContextBuilder()
                .WithMessage("Update").WithEntity(EntityCase, target.Id).WithTarget(target).WithEmptyPreImages();

            var ex = Record.Exception(() => CreateGuard(builder).Guard());

            Assert.Null(ex);
            builder.MockService.Verify(s => s.RetrieveMultiple(It.IsAny<QueryBase>()), Times.Never);
        }

        // ── Helpers ───────────────────────────────────────────────────────────────

        private static PluginContextBuilder BuildCreate(string facilityNumber, string sourceSystem)
        {
            var target = new Entity(EntityCase);
            target["qdb_facilitynumber"] = facilityNumber;
            target["qdb_facilitysourcesystem"] = sourceSystem;
            return new PluginContextBuilder()
                .WithMessage("Create").WithEntity(EntityCase, Guid.Empty).WithTarget(target).WithEmptyPreImages();
        }

        private static PluginContextBuilder BuildReactivation(string facilityNumber, string sourceSystem, Guid? selfId = null)
        {
            var id = selfId ?? Guid.NewGuid();
            var target = new Entity(EntityCase, id);
            target["statecode"] = new OptionSetValue(0);

            var preImage = new Entity(EntityCase, id);
            preImage["qdb_facilitynumber"] = facilityNumber;
            preImage["qdb_facilitysourcesystem"] = sourceSystem;

            return new PluginContextBuilder()
                .WithMessage("Update").WithEntity(EntityCase, id).WithTarget(target).WithPreImage(preImage);
        }

        private static void SetupActiveCases(PluginContextBuilder builder, params string[] caseNumbers)
        {
            var results = new EntityCollection();
            foreach (var number in caseNumbers)
            {
                var existing = new Entity(EntityCase, Guid.NewGuid());
                existing["qdb_casenumber"] = number;
                results.Entities.Add(existing);
            }
            builder.MockService.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(results);
        }

        private static ActiveCaseGuard CreateGuard(PluginContextBuilder builder) =>
            new ActiveCaseGuard(builder.Service, builder.Tracing, builder.Context);
    }
}
