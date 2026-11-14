using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Integration;
using Qdb.SurveyEngine.Plugins;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
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
            Assert.Equal(new DateTime(2026, 11, 13), RunDueSurveysPlugin.ReadRunDate(ContextWith("2026-11-13"), new DateTime(2026, 11, 13, 0, 0, 0, DateTimeKind.Utc)));
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

    // ── PluginCall input helpers ──────────────────────────────────────────────

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

    // ── AdministratorCheck ────────────────────────────────────────────────────

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

    // ── InvitationAccess edge cases ───────────────────────────────────────────

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
            var traced = new List<string>();
            var tracing = new Mock<ITracingService>();
            tracing.Setup(t => t.Trace(It.IsAny<string>(), It.IsAny<object[]>()))
                   .Callback<string, object[]>((f, a) => traced.Add(string.Format(f, a)));
            var tracer = new TracingServiceTrace(tracing.Object);

            tracer.Write("Hello world");

            Assert.Contains(traced, m => m.Contains("Hello world"));
        }
    }

    // ── SurveyTriggerPlugin.ReadChange (public static, no ServiceProvider needed) ──
    // Note: ReadChange_UnknownMessageName_ReturnsNull and
    // ReadChange_UpdateMessageWithValidEntityId_ReturnsRecordChange are covered
    // by CrmAdapterTests.SurveyTriggerPluginTests and are not duplicated here.

    public class SurveyTriggerPluginReadChangeTests
    {
        [Fact]
        public void Execute_NullServiceProvider_ThrowsInvalidPlugin()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => new SurveyTriggerPlugin().Execute(null));
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
}
