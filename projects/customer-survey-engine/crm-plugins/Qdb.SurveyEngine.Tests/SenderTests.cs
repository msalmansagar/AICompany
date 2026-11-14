using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using Qdb.SurveyEngine.Data;
using Qdb.SurveyEngine.Dispatch;
using Qdb.SurveyEngine.Domain;
using Xunit;

namespace Qdb.SurveyEngine.Tests
{
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
}
