using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Moq;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Plugins;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    /// <summary>In-memory activation collaborators, so the service runs for real.</summary>
    public sealed class InMemoryActivationStore : IActivationSourceStore, IStepRegistry, IAdministratorCheck, IOptionCodeReader
    {
        public Dictionary<Guid, ActivationSource> Sources { get; } = new Dictionary<Guid, ActivationSource>();
        public Dictionary<string, RegisteredStep> StepsByName { get; } = new Dictionary<string, RegisteredStep>();
        public HashSet<string> SupportedTables { get; } = new HashSet<string>();
        public HashSet<Guid> Administrators { get; } = new HashSet<Guid>();
        public Dictionary<string, string[]> ColumnCodes { get; } = new Dictionary<string, string[]>();
        public List<TriggerCodes> Triggers { get; } = new List<TriggerCodes>();
        public List<Guid> DeletedSteps { get; } = new List<Guid>();
        public bool? SavedIsActive { get; private set; }
        public IReadOnlyList<StepRegistration> SavedRegistrations { get; private set; }

        public ActivationSource Find(Guid sourceId) => Sources.TryGetValue(sourceId, out var source) ? source : null;
        public void SaveActivation(Guid sourceId, bool isActive, IReadOnlyList<StepRegistration> registrations) { SavedIsActive = isActive; SavedRegistrations = registrations; }
        public IReadOnlyList<TriggerCodes> GetTriggerCodes(Guid sourceId) => Triggers;
        public bool SupportsMessage(string table, string message) => SupportedTables.Contains(table);
        public RegisteredStep Find(StepSpec spec) => StepsByName.TryGetValue(StepRegistry.StepName(spec), out var step) ? step : null;
        public bool IsSystemAdministrator(Guid userId) => Administrators.Contains(userId);
        public IReadOnlyCollection<string> ReadCodes(string table, string column) => ColumnCodes.TryGetValue(column, out var codes) ? codes : null;

        public Guid Create(StepSpec spec)
        {
            var step = new RegisteredStep { Id = Guid.NewGuid(), IsEnabled = true, FilteringAttributes = spec.IsUpdate ? spec.StatusField : null, PreImageAttributes = spec.IsUpdate ? spec.StatusField : null };
            StepsByName[StepRegistry.StepName(spec)] = step;
            return step.Id;
        }

        public void Reconfigure(Guid stepId, StepSpec spec)
        {
            var step = StepsByName.Values.Single(s => s.Id == stepId);
            step.FilteringAttributes = spec.StatusField;
            step.PreImageAttributes = spec.StatusField;
        }

        public void SetEnabled(Guid stepId, bool isEnabled) => StepsByName.Values.Single(s => s.Id == stepId).IsEnabled = isEnabled;

        public void Delete(Guid stepId)
        {
            DeletedSteps.Add(stepId);
            foreach (var name in StepsByName.Where(pair => pair.Value.Id == stepId).Select(pair => pair.Key).ToList()) StepsByName.Remove(name);
        }

        public SourceActivationService Service() => new SourceActivationService(new ActivationDependencies { Sources = this, Steps = this, Administrators = this, OptionCodes = this });
    }

    public class SourceActivationServiceTests
    {
        private const string Table = "qdb_payment_authorization_ticket";
        private static readonly Guid SourceId = new Guid("55555555-5555-5555-5555-555555555555");
        private static readonly Guid AdminId = new Guid("66666666-6666-6666-6666-666666666666");
        private static readonly Guid OtherUserId = new Guid("77777777-7777-7777-7777-777777777777");
        private readonly InMemoryActivationStore _store = new InMemoryActivationStore();

        public SourceActivationServiceTests()
        {
            _store.Sources[SourceId] = new ActivationSource { Id = SourceId, Name = "Disbursements", TableLogicalName = Table, StatusField = "statuscode", TypeField = "qdb_disbursement_type_1" };
            _store.SupportedTables.Add(Table);
            _store.Administrators.Add(AdminId);
            _store.ColumnCodes["statuscode"] = new[] { "1", "751090050" };
            _store.ColumnCodes["qdb_disbursement_type_1"] = new[] { "751090000", "751090001" };
        }

        private RegisteredStep PreRegister(string message, string filter = null)
        {
            var step = new RegisteredStep { Id = Guid.NewGuid(), IsEnabled = false, FilteringAttributes = filter, PreImageAttributes = filter };
            _store.StepsByName[StepRegistry.StepName(new StepSpec(message, Table, "statuscode"))] = step;
            return step;
        }

        [Fact]
        public void Activate_NotAnAdministrator_IsRefused()
        {
            var refused = Assert.Throws<ActivationRefusedException>(() => _store.Service().Activate(SourceId, OtherUserId));

            Assert.Contains("System Administrator", refused.Message);
            Assert.Null(_store.SavedIsActive);
        }

        [Fact]
        public void Activate_UnknownSource_IsRefused()
        {
            Assert.Throws<ActivationRefusedException>(() => _store.Service().Activate(Guid.NewGuid(), AdminId));
        }

        [Fact]
        public void Activate_TableNotOnThisOrg_IsRefused()
        {
            _store.SupportedTables.Clear();

            var refused = Assert.Throws<ActivationRefusedException>(() => _store.Service().Activate(SourceId, AdminId));

            Assert.Contains("does not exist", refused.Message);
        }

        [Fact]
        public void Activate_TriggerUsesAnUnknownStatusCode_IsRefusedAndListsIt()
        {
            _store.Triggers.Add(new TriggerCodes { TriggerName = "Completed", StatusCodes = new[] { "751099999" } });

            var refused = Assert.Throws<ActivationRefusedException>(() => _store.Service().Activate(SourceId, AdminId));

            Assert.Contains("status code 751099999", refused.Message);
            Assert.Null(_store.SavedIsActive);
        }

        [Fact]
        public void Activate_PreRegisteredSteps_AreEnabledAndReused()
        {
            var create = PreRegister("Create");
            var update = PreRegister("Update", "statuscode");

            _store.Service().Activate(SourceId, AdminId);

            Assert.True(create.IsEnabled && update.IsEnabled);
            Assert.True(_store.SavedIsActive);
            Assert.All(_store.SavedRegistrations, r => Assert.False(r.WasCreatedByActivation));
        }

        [Fact]
        public void Activate_UpdateStepFilteredToAnotherField_IsPointedAtTheStatusField()
        {
            PreRegister("Create");
            var update = PreRegister("Update", "qdb_old_status");

            _store.Service().Activate(SourceId, AdminId);

            Assert.Equal("statuscode", update.FilteringAttributes);
            Assert.Equal("statuscode", update.PreImageAttributes);
        }

        [Fact]
        public void Activate_NewSourceWithoutSteps_CreatesAndRecordsThem()
        {
            var message = _store.Service().Activate(SourceId, AdminId);

            Assert.Equal(2, _store.StepsByName.Count);
            Assert.All(_store.SavedRegistrations, r => Assert.True(r.WasCreatedByActivation));
            Assert.Contains("2 created", message);
        }

        [Fact]
        public void Deactivate_StepsCreatedByActivation_AreDeleted()
        {
            _store.Service().Activate(SourceId, AdminId);
            _store.Sources[SourceId].Registrations = _store.SavedRegistrations;

            _store.Service().Deactivate(SourceId, AdminId);

            Assert.Equal(2, _store.DeletedSteps.Count);
            Assert.Empty(_store.StepsByName);
            Assert.False(_store.SavedIsActive);
        }

        [Fact]
        public void Deactivate_PreRegisteredSteps_AreDisabledNotDeleted()
        {
            var create = PreRegister("Create");
            var update = PreRegister("Update", "statuscode");
            _store.Service().Activate(SourceId, AdminId);
            _store.Sources[SourceId].Registrations = _store.SavedRegistrations;

            _store.Service().Deactivate(SourceId, AdminId);

            Assert.Empty(_store.DeletedSteps);
            Assert.False(create.IsEnabled || update.IsEnabled);
        }

        [Fact]
        public void Deactivate_NoRecordedRegistrations_StillDisablesTheSourcesSteps()
        {
            var update = PreRegister("Update", "statuscode");
            update.IsEnabled = true;

            _store.Service().Deactivate(SourceId, AdminId);

            Assert.False(update.IsEnabled);
        }

        [Fact]
        public void Deactivate_NotAnAdministrator_IsRefused()
        {
            Assert.Throws<ActivationRefusedException>(() => _store.Service().Deactivate(SourceId, OtherUserId));
        }
    }

    public class TriggerCodeValidatorTests
    {
        [Fact]
        public void FindUnknownCodes_AllKnown_IsEmpty()
        {
            var problems = TriggerCodeValidator.FindUnknownCodes(
                new[] { new TriggerCodes { TriggerName = "T", StatusCodes = new[] { "1" }, TypeCodes = new[] { "7" } } },
                new ValidSourceCodes { Status = new[] { "1" }, Type = new[] { "7" } });

            Assert.Empty(problems);
        }

        [Fact]
        public void FindUnknownCodes_TypeCodesOnANonChoiceColumn_ReportsIt()
        {
            var problems = TriggerCodeValidator.FindUnknownCodes(
                new[] { new TriggerCodes { TriggerName = "T", TypeCodes = new[] { "7" } } },
                new ValidSourceCodes { Status = new[] { "1" }, Type = null });

            Assert.Contains("not a choice column", Assert.Single(problems));
        }
    }

    public class StepRegistrationTests
    {
        [Fact]
        public void Json_RoundTrip_KeepsEveryRegistration()
        {
            var original = new[] { new StepRegistration { Message = "Update", StepId = Guid.NewGuid(), WasCreatedByActivation = true } };

            var restored = StepRegistration.FromJson(StepRegistration.ToJson(original)).Single();

            Assert.Equal(original[0].StepId, restored.StepId);
            Assert.True(restored.WasCreatedByActivation);
        }

        [Fact]
        public void FromJson_Blank_IsEmpty()
        {
            Assert.Empty(StepRegistration.FromJson(null));
        }
    }

    public class SourceActivationPluginTests
    {
        [Fact]
        public void ReadSourceId_Missing_IsRefused()
        {
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InputParameters).Returns(new ParameterCollection());

            Assert.Throws<InvalidPluginExecutionException>(() => SourceActivationPluginBase.ReadSourceId(context.Object));
        }

        [Fact]
        public void ReadSourceId_Present_IsReturned()
        {
            var id = Guid.NewGuid();
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.InputParameters).Returns(new ParameterCollection { { "SourceId", id } });

            Assert.Equal(id, SourceActivationPluginBase.ReadSourceId(context.Object));
        }
    }
}
