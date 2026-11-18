using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.OneTime;
using Qdb.SurveyEngine.Plugins;
using Qdb.SurveyEngine.Scheduling;
using Qdb.SurveyEngine.Services;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class OneTimePluginTests
    {
        private readonly Mock<IOrganizationService> _service = new Mock<IOrganizationService>();
        private readonly ParameterCollection _outputs = new ParameterCollection();

        private void Execute(IPlugin plugin, object triggerId, bool isCallerAdmin)
        {
            _service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>()))
                .Returns((QueryBase query) => IsTriggerQuery(query) || !isCallerAdmin ? new EntityCollection() : new EntityCollection(new[] { new Entity("role") }));
            var inputs = new ParameterCollection();
            if (triggerId != null) inputs[OneTimePluginBase.TriggerIdParameter] = triggerId;
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InputParameters).Returns(inputs);
            context.SetupGet(c => c.OutputParameters).Returns(_outputs);
            context.SetupGet(c => c.InitiatingUserId).Returns(Guid.NewGuid());
            var factory = new Mock<IOrganizationServiceFactory>();
            factory.Setup(f => f.CreateOrganizationService(It.IsAny<Guid?>())).Returns(_service.Object);
            var provider = new Mock<IServiceProvider>();
            provider.Setup(p => p.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
            provider.Setup(p => p.GetService(typeof(ITracingService))).Returns(new Mock<ITracingService>().Object);
            provider.Setup(p => p.GetService(typeof(IOrganizationServiceFactory))).Returns(factory.Object);
            plugin.Execute(provider.Object);
        }

        private static bool IsTriggerQuery(QueryBase query) => query is QueryExpression expression && expression.EntityName == "qdb_survey_trigger";

        [Fact]
        public void Execute_NoTriggerId_IsRefused()
        {
            Assert.Contains("TriggerId", Assert.Throws<InvalidPluginExecutionException>(() => Execute(new PreviewAudiencePlugin(), null, true)).Message);
        }

        [Fact]
        public void Execute_EmptyTriggerId_IsRefused()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => Execute(new SendOneTimeTriggerPlugin(), Guid.Empty, true));
        }

        [Fact]
        public void Execute_CallerNotSurveyAdmin_IsRefused()
        {
            Assert.Contains("Survey Admin", Assert.Throws<InvalidPluginExecutionException>(() => Execute(new SendOneTimeTriggerPlugin(), Guid.NewGuid(), false)).Message);
        }

        [Fact]
        public void Preview_UnknownTrigger_ReachesTheCallerAsTheRefusal()
        {
            Assert.Contains("does not exist", Assert.Throws<InvalidPluginExecutionException>(() => Execute(new PreviewAudiencePlugin(), Guid.NewGuid(), true)).Message);
        }

        [Fact]
        public void Send_UnknownTrigger_ReachesTheCallerAsTheRefusal()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => Execute(new SendOneTimeTriggerPlugin(), Guid.NewGuid(), true));
        }

        [Fact]
        public void Execute_NullServiceProvider_Throws()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => new PreviewAudiencePlugin().Execute(null));
        }

        [Fact]
        public void ValidationPlugin_NullServiceProvider_Throws()
        {
            Assert.Throws<InvalidPluginExecutionException>(() => new TriggerAudienceValidationPlugin().Execute(null));
        }
    }

    public class OneTimeServiceGuardTests
    {
        private static SurveyTriggerDependencies Pipeline() => new InMemorySurveyStore().AsDependencies();

        public static IEnumerable<object[]> IncompleteDependencies()
        {
            var store = new InMemoryOneTimeStore(new InMemorySurveyStore());
            var keys = new InMemorySchedulingStore(new InMemorySurveyStore());
            yield return new object[] { new OneTimeSendDependencies { Pipeline = null, Triggers = store, Audience = store, GeneratedKeys = keys, CustomerTable = "account" } };
            yield return new object[] { new OneTimeSendDependencies { Pipeline = new SurveyTriggerDependencies(), Triggers = store, Audience = store, GeneratedKeys = keys, CustomerTable = "account" } };
            yield return new object[] { new OneTimeSendDependencies { Pipeline = Pipeline(), Triggers = null, Audience = store, GeneratedKeys = keys, CustomerTable = "account" } };
            yield return new object[] { new OneTimeSendDependencies { Pipeline = Pipeline(), Triggers = store, Audience = null, GeneratedKeys = keys, CustomerTable = "account" } };
            yield return new object[] { new OneTimeSendDependencies { Pipeline = Pipeline(), Triggers = store, Audience = store, GeneratedKeys = null, CustomerTable = "account" } };
        }

        [Theory]
        [MemberData(nameof(IncompleteDependencies))]
        public void OneTimeSendService_MissingDependency_Throws(OneTimeSendDependencies dependencies)
        {
            Assert.Throws<ArgumentException>(() => new OneTimeSendService(dependencies));
        }

        [Fact]
        public void OneTimeSendService_NullDependencies_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new OneTimeSendService(null));
        }

        [Fact]
        public void Send_NullBudget_Throws()
        {
            var pipeline = new InMemorySurveyStore();
            var scheduling = new InMemorySchedulingStore(pipeline);
            var service = new OneTimeSendService(new OneTimeSendDependencies { Pipeline = pipeline.AsDependencies(), Triggers = scheduling.OneTime, Audience = scheduling.OneTime, GeneratedKeys = scheduling, CustomerTable = "account" });

            Assert.Throws<ArgumentNullException>(() => service.Send(Guid.NewGuid(), null));
        }

        public static IEnumerable<object[]> MissingAddendumDMembers()
        {
            yield return new object[] { (Action<RunDueSurveysDependencies>)(d => d.OneTimeTriggers = null) };
            yield return new object[] { (Action<RunDueSurveysDependencies>)(d => d.Audience = null) };
            yield return new object[] { (Action<RunDueSurveysDependencies>)(d => d.DailyPassGate = null) };
            yield return new object[] { (Action<RunDueSurveysDependencies>)(d => d.CustomerTable = " ") };
            yield return new object[] { (Action<RunDueSurveysDependencies>)(d => d.InvitationRetention = null) };
            yield return new object[] { (Action<RunDueSurveysDependencies>)(d => d.Postponed = null) };
            yield return new object[] { (Action<RunDueSurveysDependencies>)(d => d.Pipeline.Clock = null) };
        }

        [Theory]
        [MemberData(nameof(MissingAddendumDMembers))]
        public void RunDueSurveysCompose_MissingMember_Throws(Action<RunDueSurveysDependencies> breakIt)
        {
            var dependencies = new InMemorySchedulingStore(new InMemorySurveyStore()).AsDependencies();
            breakIt(dependencies);

            Assert.Throws<ArgumentException>(() => RunDueSurveysService.Compose(dependencies));
        }

        [Fact]
        public void RunDueSurveysCompose_Null_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => RunDueSurveysService.Compose(null));
        }

        [Fact]
        public void RunDueSurveysRun_NullBudget_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => RunDueSurveysService.Compose(new InMemorySchedulingStore(new InMemorySurveyStore()).AsDependencies()).Run(DateTime.UtcNow, null));
        }

        [Fact]
        public void DailyPasses_NullPass_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new DailyPasses(null, null, null));
        }

        [Fact]
        public void OneTimeDuePass_NullCollaborators_Throw()
        {
            Assert.Throws<ArgumentNullException>(() => new OneTimeDuePass(null, null, null));
        }

        [Fact]
        public void OneTimeDuePass_BudgetAlreadySpent_LeavesDueTriggersForTheNextCall()
        {
            var pipeline = new InMemorySurveyStore();
            var scheduling = new InMemorySchedulingStore(pipeline);
            var trigger = new OneTimeTrigger
            {
                Trigger = new SurveyTrigger { Id = Guid.NewGuid(), Kind = TriggerKind.OneTime, Setup = new SurveySetup { Id = Guid.NewGuid(), FormCode = "srv_x" } },
                IsTriggerActive = true, IsSetupActive = true, SendOn = pipeline.UtcNow.AddMinutes(-1),
            };
            scheduling.OneTime.Triggers[trigger.Trigger.Id] = trigger;
            var deps = scheduling.AsDependencies();
            var sender = new OneTimeSendService(new OneTimeSendDependencies { Pipeline = deps.Pipeline, Triggers = scheduling.OneTime, Audience = scheduling.OneTime, GeneratedKeys = scheduling, CustomerTable = "account" });

            var result = new OneTimeDuePass(scheduling.OneTime, sender, deps.Pipeline).Run(new RunBudget(pipeline, TimeSpan.Zero));

            Assert.False(result.IsComplete);
            Assert.Equal(OneTimeRunStatus.NotSent, trigger.Run.Status);
        }

        [Fact]
        public void OneTimeDuePass_NullBudget_Throws()
        {
            var pipeline = new InMemorySurveyStore();
            var scheduling = new InMemorySchedulingStore(pipeline);
            var deps = scheduling.AsDependencies();
            var sender = new OneTimeSendService(new OneTimeSendDependencies { Pipeline = deps.Pipeline, Triggers = scheduling.OneTime, Audience = scheduling.OneTime, GeneratedKeys = scheduling, CustomerTable = "account" });

            Assert.Throws<ArgumentNullException>(() => new OneTimeDuePass(scheduling.OneTime, sender, deps.Pipeline).Run(null));
        }

        [Fact]
        public void OneTimeDueResult_IncompleteSend_MakesThePassIncomplete()
        {
            var result = new OneTimeDueResult();

            result.Add(new OneTimeSendResult { Status = OneTimeRunStatus.Sending, IsComplete = false });

            Assert.Equal((false, 0), (result.IsComplete, result.Sent));
        }

        [Fact]
        public void OneTimeSendResult_ToString_ShowsContinuingAndMessage()
        {
            var text = new OneTimeSendResult { Status = OneTimeRunStatus.Sending, IsComplete = false, Message = "m" }.ToString();

            Assert.Contains("(continuing)", text);
            Assert.Contains("— m", text);
        }
    }

    public class OneTimeTriggerStoreDefaultTests
    {
        [Fact]
        public void Find_RowWithoutOptionalColumns_UsesTheDefaults()
        {
            var id = Guid.NewGuid();
            var row = new Entity("qdb_survey_trigger", id)
            {
                ["qdb_trigger_kind"] = new OptionSetValue((int)TriggerKind.OneTime),
                ["createdon"] = DateTime.UtcNow,
                ["setup.qdb_survey_setupid"] = new AliasedValue("qdb_survey_setup", "qdb_survey_setupid", Guid.NewGuid()),
            };
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(new[] { row }));

            var trigger = new OneTimeTriggerStore(service.Object).Find(id);

            Assert.Equal((AudienceKind.AllActiveCustomers, OneTimeRunStatus.NotSent, 1, false, false),
                (trigger.Audience, trigger.Run.Status, trigger.Run.NextPage, trigger.IsTriggerActive, trigger.IsSetupActive));
        }

        [Fact]
        public void TrySaveProgress_WritesCursorAndTotals()
        {
            var service = new Mock<IOrganizationService>();
            Entity updated = null;
            service.Setup(s => s.Execute(It.IsAny<OrganizationRequest>())).Callback<OrganizationRequest>(r => updated = ((Microsoft.Xrm.Sdk.Messages.UpdateRequest)r).Target).Returns(new Microsoft.Xrm.Sdk.Messages.UpdateResponse());
            service.Setup(s => s.Retrieve(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<ColumnSet>())).Returns(new Entity("qdb_survey_trigger"));

            new OneTimeTriggerStore(service.Object).TrySaveProgress(Guid.NewGuid(), new OneTimeRunState { Status = OneTimeRunStatus.Sending, NextPage = 2, PagingCookie = "c", Counts = new OneTimeCounts { Postponed = 3 } });

            Assert.Equal(("2|c", 3), (updated.GetAttributeValue<string>("qdb_run_cursor"), updated.GetAttributeValue<int>("qdb_postponed_count")));
        }

        [Fact]
        public void RunWrite_SavedWithoutVersion_HasAnEmptyVersion()
        {
            Assert.Equal((true, string.Empty), (RunWrite.Saved(null).IsSaved, RunWrite.Saved(null).RowVersion));
        }

        [Fact]
        public void Constructor_NullService_Throws()
        {
            Assert.Throws<ArgumentNullException>(() => new OneTimeTriggerStore(null));
        }

        [Fact]
        public void OtherDataClasses_NullService_Throw()
        {
            Assert.Throws<ArgumentNullException>(() => new AudienceReader(null));
            Assert.Throws<ArgumentNullException>(() => new DailyPassGate(null));
            Assert.Throws<ArgumentNullException>(() => new OneTimeAccessCheck(null, null));
        }
    }
}
