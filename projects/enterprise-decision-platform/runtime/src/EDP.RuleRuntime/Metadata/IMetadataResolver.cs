using System.Collections.Generic;

namespace EDP.RuleRuntime.Metadata
{
    /// <summary>
    /// Describes one bound attribute the runtime may read as a decision input.
    /// </summary>
    public sealed class AttributeInfo
    {
        public AttributeInfo(string logicalName, FieldType fieldType, string? displayName = null)
        {
            LogicalName = logicalName;
            FieldType = fieldType;
            DisplayName = displayName ?? logicalName;
        }

        public string LogicalName { get; }
        public FieldType FieldType { get; }
        public string DisplayName { get; }
    }

    /// <summary>
    /// Abstraction over CRM metadata. The live implementation talks to the
    /// Organization Service / Web API; the in-memory implementation lets the
    /// runtime compile and execute against PCRM fixtures with no CRM present.
    /// This interface is what makes local unit testing (Milestone A) possible.
    /// </summary>
    public interface IMetadataResolver
    {
        bool TryGetAttribute(string entityLogicalName, string attributeLogicalName, out AttributeInfo attribute);

        bool EntityExists(string entityLogicalName);

        /// <summary>Valid option values for an OptionSet/State/Status attribute, if known.</summary>
        IReadOnlyCollection<int> GetOptionValues(string entityLogicalName, string attributeLogicalName);
    }
}
