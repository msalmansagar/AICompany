using System;
using System.Collections.Generic;
using System.Globalization;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Qdb.SurveyEngine.Dispatch;
using Qdb.SurveyEngine.Integration;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Hands an SMS to the org's SMS service by creating a row in its configured SMS table
    /// (section 10.1): HL uses letter, BFD/QDB1 use fax, and the columns differ, so all of them come
    /// from qdb_survey_sms_config. Static column values are text in the JSON and are converted to the
    /// column's type from its metadata.
    /// </summary>
    public sealed class SmsHandOff : ISmsHandOff
    {
        private readonly IOrganizationService _service;

        public SmsHandOff(IOrganizationService service)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public ChannelOutcome Send(SmsHandOffConfig config, SmsMessage message)
        {
            try
            {
                var row = new Entity(config.TableLogicalName) { [config.RecipientField] = message.Recipient, [config.MessageField] = FitText(config, message) };
                if (!string.IsNullOrWhiteSpace(config.CustomerLinkField)) row[config.CustomerLinkField] = new EntityReference("account", message.CustomerId);
                foreach (var column in ReadStaticColumns(config.StaticColumnsJson)) row[column.Key] = Convert(config.TableLogicalName, column.Key, column.Value);
                _service.Create(row);
                return ChannelOutcome.Sent();
            }
            catch (FaultException<OrganizationServiceFault> fault)
            {
                return ChannelOutcome.Failed($"{config.TableLogicalName} row could not be created: {fault.Detail.Message}");
            }
            catch (SmsConfigurationException invalid)
            {
                return ChannelOutcome.Failed(invalid.Message);
            }
            catch (FormatException invalid)
            {
                return ChannelOutcome.Failed("A Static Columns JSON value does not match its column's type: " + invalid.Message);
            }
        }

        // The full text when the message column can hold it; otherwise title and link, so the link is never cut off.
        private string FitText(SmsHandOffConfig config, SmsMessage message)
        {
            var maxLength = (Attribute(config.TableLogicalName, config.MessageField) as StringAttributeMetadata)?.MaxLength
                ?? (Attribute(config.TableLogicalName, config.MessageField) as MemoAttributeMetadata)?.MaxLength;
            return !maxLength.HasValue || message.FullText.Length <= maxLength.Value ? message.FullText : message.ShortText;
        }

        private static IDictionary<string, string> ReadStaticColumns(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new Dictionary<string, string>();
            try
            {
                return JsonText.Read<Dictionary<string, string>>(json, "Static Columns JSON");
            }
            catch (SurveyApiException invalid)
            {
                throw new SmsConfigurationException(invalid.Message);
            }
        }

        private object Convert(string table, string column, string value)
        {
            var attribute = Attribute(table, column);
            switch (attribute.AttributeType)
            {
                case AttributeTypeCode.Picklist:
                case AttributeTypeCode.State:
                case AttributeTypeCode.Status:
                    return new OptionSetValue(int.Parse(value, CultureInfo.InvariantCulture));
                case AttributeTypeCode.Boolean:
                    return value == "1" || bool.Parse(value);
                case AttributeTypeCode.Integer:
                    return int.Parse(value, CultureInfo.InvariantCulture);
                case AttributeTypeCode.Decimal:
                    return decimal.Parse(value, CultureInfo.InvariantCulture);
                case AttributeTypeCode.String:
                case AttributeTypeCode.Memo:
                    return value;
                default:
                    throw new SmsConfigurationException($"Static column {column} is a {attribute.AttributeType} column; only text, number, yes/no and choice columns can be set.");
            }
        }

        private AttributeMetadata Attribute(string table, string column)
        {
            try
            {
                var response = (RetrieveAttributeResponse)_service.Execute(new RetrieveAttributeRequest { EntityLogicalName = table, LogicalName = column });
                return response.AttributeMetadata;
            }
            catch (FaultException<OrganizationServiceFault> fault)
            {
                throw new SmsConfigurationException($"Column {table}.{column} was not found: {fault.Detail.Message}");
            }
        }
    }

    /// <summary>The SMS configuration names a column that does not exist or cannot be set.</summary>
    public sealed class SmsConfigurationException : Exception
    {
        public SmsConfigurationException(string message) : base(message) { }
    }
}
