using Microsoft.Xrm.Sdk.Metadata;
using EDP.RuleRuntime.Metadata;

namespace EDP.RuleRuntime.Crm.Metadata
{
    /// <summary>Maps CRM attribute types to the runtime's FieldType.</summary>
    public static class FieldTypeMapper
    {
        public static FieldType Map(AttributeTypeCode code)
        {
            switch (code)
            {
                case AttributeTypeCode.String: return FieldType.Text;
                case AttributeTypeCode.Memo: return FieldType.Memo;
                case AttributeTypeCode.Integer:
                case AttributeTypeCode.BigInt: return FieldType.WholeNumber;
                case AttributeTypeCode.Decimal:
                case AttributeTypeCode.Double: return FieldType.Decimal;
                case AttributeTypeCode.Money: return FieldType.Currency;
                case AttributeTypeCode.DateTime: return FieldType.DateTime;
                case AttributeTypeCode.Boolean: return FieldType.Boolean;
                case AttributeTypeCode.Picklist: return FieldType.OptionSet;
                case AttributeTypeCode.State: return FieldType.State;
                case AttributeTypeCode.Status: return FieldType.Status;
                case AttributeTypeCode.Lookup: return FieldType.Lookup;
                case AttributeTypeCode.Owner: return FieldType.Owner;
                case AttributeTypeCode.Customer: return FieldType.Customer;
                case AttributeTypeCode.Uniqueidentifier: return FieldType.UniqueIdentifier;
                default: return FieldType.Text;
            }
        }
    }
}
