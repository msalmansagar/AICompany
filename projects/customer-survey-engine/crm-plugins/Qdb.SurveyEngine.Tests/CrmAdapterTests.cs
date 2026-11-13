using System;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Plugins;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
    public class SourceRecordReaderTests
    {
        private static readonly Guid RecordId = new Guid("33333333-3333-3333-3333-333333333333");
        private static readonly Guid AccountId = new Guid("44444444-4444-4444-4444-444444444444");

        private static SurveySource Source() => new SurveySource(Guid.NewGuid(), "qdb_loan_application", new SourceFields
        {
            CustomerLookup = "qdb_cif_no", Type = "qdb_loanappl_type", Status = "statuscode", Origin = "qdb_digitalfinancing",
        });

        private static RecordChange ReadWith(Entity current, Entity preImage) => ReadWith(current, preImage, CustomerLink.Account);

        private static RecordChange ReadWith(Entity current, Entity preImage, CustomerLink customer)
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Retrieve("qdb_loan_application", RecordId, It.IsAny<ColumnSet>())).Returns(current);
            var change = new RecordChange { Message = ChangeMessage.Update, TableLogicalName = "qdb_loan_application", RecordId = RecordId };
            return new SourceRecordReader(service.Object, preImage, customer).ReadCurrent(Source(), change);
        }

        private static Entity Record(EntityReference customer) => new Entity("qdb_loan_application", RecordId)
        {
            ["statuscode"] = new OptionSetValue(100000005),
            ["qdb_loanappl_type"] = new OptionSetValue(7),
            ["qdb_digitalfinancing"] = true,
            ["qdb_cif_no"] = customer,
        };

        [Fact]
        public void ReadCurrent_Record_RendersCodesAsText()
        {
            var change = ReadWith(Record(new EntityReference("account", AccountId)), null);

            Assert.Equal("100000005", change.NewStatus);
            Assert.Equal("7", change.Type);
            Assert.Equal("true", change.Origin);
        }

        [Fact]
        public void ReadCurrent_AccountLookup_IsTheCustomer()
        {
            Assert.Equal(AccountId, ReadWith(Record(new EntityReference("account", AccountId)), null).CustomerId);
        }

        [Fact]
        public void ReadCurrent_LookupToAnotherTable_IsNoCustomer()
        {
            Assert.Null(ReadWith(Record(new EntityReference("contact", AccountId)), null).CustomerId);
        }

        [Fact]
        public void ReadCurrent_ContactOrgContactLookup_IsTheCustomer()
        {
            Assert.Equal(AccountId, ReadWith(Record(new EntityReference("contact", AccountId)), null, CustomerLink.Contact).CustomerId);
        }

        [Fact]
        public void ReadCurrent_ContactOrgAccountLookup_IsNoCustomer()
        {
            Assert.Null(ReadWith(Record(new EntityReference("account", AccountId)), null, CustomerLink.Contact).CustomerId);
        }

        [Fact]
        public void ReadCurrent_PreImage_GivesTheOldStatus()
        {
            var preImage = new Entity("qdb_loan_application", RecordId) { ["statuscode"] = new OptionSetValue(1) };

            Assert.Equal("1", ReadWith(Record(null), preImage).OldStatus);
        }
    }

    public class InvitationRepositoryTests
    {
        [Fact]
        public void TryCreate_AlternateKeyCollision_AnswersFalse()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80060892) };
            service.Setup(s => s.Create(It.IsAny<Entity>())).Throws(new FaultException<OrganizationServiceFault>(fault));

            Assert.False(new InvitationRepository(service.Object, CustomerLink.Account).TryCreate(new InvitationDraft { DedupeKey = "k", Name = "n" }));
        }

        [Fact]
        public void TryCreate_OtherFault_IsRethrown()
        {
            var service = new Mock<IOrganizationService>();
            var fault = new OrganizationServiceFault { ErrorCode = unchecked((int)0x80040220) };
            service.Setup(s => s.Create(It.IsAny<Entity>())).Throws(new FaultException<OrganizationServiceFault>(fault));

            Assert.Throws<FaultException<OrganizationServiceFault>>(() => new InvitationRepository(service.Object, CustomerLink.Account).TryCreate(new InvitationDraft { DedupeKey = "k", Name = "n" }));
        }

        [Fact]
        public void TryCreate_Draft_WritesTheCustomerAsAnAccountLookup()
        {
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());
            var customerId = Guid.NewGuid();

            new InvitationRepository(service.Object, CustomerLink.Account).TryCreate(new InvitationDraft { CustomerId = customerId, DedupeKey = "k", Name = "n" });

            Assert.Equal(new EntityReference("account", customerId), written.GetAttributeValue<EntityReference>("qdb_customer_id"));
        }

        [Fact]
        public void TryCreate_ContactOrg_WritesTheCustomerAsAContactLookup()
        {
            Entity written = null;
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.Create(It.IsAny<Entity>())).Callback<Entity>(e => written = e).Returns(Guid.NewGuid());
            var customerId = Guid.NewGuid();

            new InvitationRepository(service.Object, CustomerLink.Contact).TryCreate(new InvitationDraft { CustomerId = customerId, DedupeKey = "k", Name = "n" });

            Assert.Equal(new EntityReference("contact", customerId), written.GetAttributeValue<EntityReference>("qdb_customer_contact_id"));
        }
    }

    public class CustomerLinkReaderTests
    {
        private static CustomerLink ReadWith(params Entity[] settingsRows)
        {
            var service = new Mock<IOrganizationService>();
            service.Setup(s => s.RetrieveMultiple(It.IsAny<QueryBase>())).Returns(new EntityCollection(settingsRows));
            return CustomerLinkReader.Read(service.Object);
        }

        [Fact]
        public void Read_NoSettingsRow_IsAccount()
        {
            Assert.Same(CustomerLink.Account, ReadWith());
        }

        [Fact]
        public void Read_SettingUnset_IsAccount()
        {
            Assert.Same(CustomerLink.Account, ReadWith(new Entity("qdb_survey_settings", Guid.NewGuid())));
        }

        [Fact]
        public void Read_SettingContact_IsContact()
        {
            var row = new Entity("qdb_survey_settings", Guid.NewGuid()) { ["qdb_customer_table"] = new OptionSetValue((int)CustomerTable.Contact) };

            Assert.Same(CustomerLink.Contact, ReadWith(row));
        }

        [Fact]
        public void CustomerIdOf_ContactLink_ReadsTheContactLookupOnly()
        {
            var id = Guid.NewGuid();
            var row = new Entity("qdb_survey_invitation") { ["qdb_customer_id"] = new EntityReference("account", Guid.NewGuid()), ["qdb_customer_contact_id"] = new EntityReference("contact", id) };

            Assert.Equal(id, CustomerLink.Contact.CustomerIdOf(row));
        }
    }

    public class SurveyTriggerPluginTests
    {
        private static IPluginExecutionContext Context(string message, Guid id)
        {
            var context = new Mock<IPluginExecutionContext>();
            context.SetupGet(c => c.MessageName).Returns(message);
            context.SetupGet(c => c.PrimaryEntityName).Returns("qdb_cheque_clearing");
            context.SetupGet(c => c.PrimaryEntityId).Returns(id);
            return context.Object;
        }

        [Fact]
        public void ReadChange_Update_DescribesTheRecord()
        {
            var id = Guid.NewGuid();

            var change = SurveyTriggerPlugin.ReadChange(Context("Update", id));

            Assert.Equal(ChangeMessage.Update, change.Message);
            Assert.Equal(id, change.RecordId);
            Assert.Equal("qdb_cheque_clearing", change.TableLogicalName);
        }

        [Fact]
        public void ReadChange_OtherMessage_IsIgnored()
        {
            Assert.Null(SurveyTriggerPlugin.ReadChange(Context("Delete", Guid.NewGuid())));
        }
    }

    public class CodeTextTests
    {
        [Fact]
        public void Of_Null_StaysNull()
        {
            Assert.Null(CodeText.Of(null));
        }

        [Fact]
        public void Of_False_IsLowercaseFalse()
        {
            Assert.Equal("false", CodeText.Of(false));
        }
    }
}
