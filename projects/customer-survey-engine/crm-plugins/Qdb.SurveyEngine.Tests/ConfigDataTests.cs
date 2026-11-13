using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Activation;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
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
}
