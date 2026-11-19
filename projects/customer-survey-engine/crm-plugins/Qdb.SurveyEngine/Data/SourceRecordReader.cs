using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Qdb.SurveyEngine.Domain;
using Qdb.SurveyEngine.Services;

namespace Qdb.SurveyEngine.Data
{
    /// <summary>
    /// Reads a source record's new status, type, origin and customer as the event set them (the request's
    /// Target), falling back to the record as it is now for fields the event did not carry, and its old status
    /// from the step's pre-image. The fallback read means the pre-image only needs the status field, whatever
    /// the source's other field names are.
    /// </summary>
    public sealed class SourceRecordReader : ISourceRecordReader
    {
        private readonly IOrganizationService _service;
        private readonly Entity _preImage;
        private readonly Entity _target;
        private readonly CustomerLink _customer;

        /// <param name="service">Organisation service.</param>
        /// <param name="images">What the step's pipeline context carried about the record.</param>
        /// <param name="customer">The org's customer table (account or contact).</param>
        public SourceRecordReader(IOrganizationService service, RecordImages images, CustomerLink customer)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            if (images == null) throw new ArgumentNullException(nameof(images));
            _preImage = images.PreImage;
            _target = images.Target;
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
                NewStatus = CodeText.Of(EventValue(record, fields.Status)),
                Type = CodeText.Of(EventValue(record, fields.Type)),
                Origin = CodeText.Of(EventValue(record, fields.Origin)),
                CustomerId = CustomerOf(EventValue(record, fields.CustomerLookup)),
            };
        }

        // The step is async: by the time it runs the record may have moved on (DEF-CSE-001). A value the event itself
        // set is the one the survey decision is about; the fresh read only fills fields the event did not carry.
        private object EventValue(Entity record, string attribute) =>
            _target != null && !string.IsNullOrWhiteSpace(attribute) && _target.Contains(attribute) ? _target[attribute] : Value(record, attribute);

        private static object Value(Entity entity, string attribute) =>
            string.IsNullOrWhiteSpace(attribute) || !entity.Contains(attribute) ? null : entity[attribute];

        // Only a lookup to the org's customer table is a customer; anything else counts as none (logged as No customer).
        private Guid? CustomerOf(object value) =>
            value is EntityReference reference && reference.LogicalName == _customer.TableLogicalName ? reference.Id : (Guid?)null;
    }

    /// <summary>The record as the trigger step's pipeline context carried it.</summary>
    public sealed class RecordImages
    {
        /// <summary>The Update step's pre-image (holds the old status); null on Create.</summary>
        public Entity PreImage { get; set; }

        /// <summary>The Create or Update request's Target: the values the event itself set; null when absent.</summary>
        public Entity Target { get; set; }
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
