using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Dispatch;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Scheduling;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
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
}
