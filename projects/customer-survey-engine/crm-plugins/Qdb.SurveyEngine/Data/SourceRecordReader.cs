using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Reads a source record's current status, type, origin and customer, and its old status from
    /// the step's pre-image. Reading the record fresh means the pre-image only needs the status
    /// field, whatever the source's other field names are.
    /// </summary>
    public sealed class SourceRecordReader : ISourceRecordReader
    {
        private readonly IOrganizationService _service;
        private readonly Entity _preImage;
        private readonly CustomerLink _customer;

        /// <param name="service">Organisation service.</param>
        /// <param name="preImage">The Update step's pre-image; null on Create.</param>
        /// <param name="customer">The org's customer table (account or contact).</param>
        public SourceRecordReader(IOrganizationService service, Entity preImage, CustomerLink customer)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _preImage = preImage;
            _customer = customer ?? throw new ArgumentNullException(nameof(customer));
        }

        /// <inheritdoc />
        public RecordChange ReadCurrent(SurveySource source, RecordChange change)
        {
            var fields = source.Fields;
            var columns = new[] { fields.Status, fields.Type, fields.Origin, fields.CustomerLookup }
                .Where(name => !string.IsNullOrWhiteSpace(name)).Distinct().ToArray();
            var record = _service.Retrieve(change.TableLogicalName, change.RecordId, new ColumnSet(columns));
            return new RecordChange
            {
                Message = change.Message,
                TableLogicalName = change.TableLogicalName,
                RecordId = change.RecordId,
                OldStatus = _preImage == null ? null : CodeText.Of(Value(_preImage, fields.Status)),
                NewStatus = CodeText.Of(Value(record, fields.Status)),
                Type = CodeText.Of(Value(record, fields.Type)),
                Origin = CodeText.Of(Value(record, fields.Origin)),
                CustomerId = CustomerOf(Value(record, fields.CustomerLookup)),
            };
        }

        private static object Value(Entity entity, string attribute) =>
            string.IsNullOrWhiteSpace(attribute) || !entity.Contains(attribute) ? null : entity[attribute];

        // Only a lookup to the org's customer table is a customer; anything else counts as none (logged as No customer).
        private Guid? CustomerOf(object value) =>
            value is EntityReference reference && reference.LogicalName == _customer.TableLogicalName ? reference.Id : (Guid?)null;
    }

    /// <summary>Renders CRM attribute values as the text codes <see cref="CodeList"/> compares.</summary>
    public static class CodeText
    {
        /// <summary>OptionSetValue → "100000003", bool → "true"/"false", others → ToString(); null stays null.</summary>
        public static string Of(object value)
        {
            if (value == null) return null;
            if (value is OptionSetValue option) return option.Value.ToString();
            if (value is bool flag) return flag ? "true" : "false";
            return value.ToString();
        }
    }
}
