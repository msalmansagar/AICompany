namespace EDP.RuleRuntime.Metadata
{
    /// <summary>
    /// The CRM/Dataverse field types the runtime understands. Mirrors the designer
    /// spec's field-type list. Drives operator validity and value coercion.
    /// </summary>
    public enum FieldType
    {
        Text,
        Memo,
        WholeNumber,
        Decimal,
        Currency,
        Date,
        DateTime,
        Boolean,
        OptionSet,
        MultiSelectOptionSet,
        Lookup,
        Owner,
        Customer,
        UniqueIdentifier,
        State,
        Status
    }
}
