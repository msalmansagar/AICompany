using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

// Block-scoped namespace + explicit usings, and no reliance on ImplicitUsings —
// this contract is vendored into plugin projects that target older frameworks
// (net462/net471) with older LangVersion, where file-scoped namespaces and
// implicit usings are unavailable.
namespace Mss.Dataverse
{
    /// <summary>
    /// Canonical Dataverse metadata contract — MSS Technologies global library.
    /// One interface, satisfied per runtime: <c>DataverseMetadataService</c> (Web
    /// API, middle-tier) and <c>OrgServiceMetadataService</c> (Org Service SDK,
    /// plugins). The TypeScript sibling is @mss/dataverse-metadata.
    ///
    /// Embeds the platform rules: entity metadata is read by a DIRECT
    /// EntityDefinitions(LogicalName='x') lookup (never a filtered scan, which is
    /// silently paginated); option-set values are the real 100000000-based codes.
    /// </summary>
    public interface IDataverseMetadata
    {
        /// <summary>Resolve an entity logical name to its Web API entity-set name.</summary>
        Task<string> ResolveEntitySetNameAsync(string entityLogicalName, CancellationToken cancellationToken);

        /// <summary>The fields (attributes) of an entity.</summary>
        Task<IReadOnlyList<FieldMetadata>> GetFieldsAsync(string entityLogicalName, CancellationToken cancellationToken);

        /// <summary>The option-set values of a Picklist/MultiSelect attribute.</summary>
        Task<IReadOnlyList<OptionMetadata>> GetOptionsAsync(
            string entityLogicalName,
            string attributeLogicalName,
            CancellationToken cancellationToken);
    }

    /// <summary>The token getter the caller injects — never a secret, just a token.</summary>
    public interface IDataverseTokenSource
    {
        Task<string> GetAccessTokenAsync(CancellationToken cancellationToken);
    }

    /// <summary>A single field (attribute) on an entity.</summary>
    /// <remarks>
    /// <see cref="Options"/> carries the option-set values for Picklist/MultiSelect
    /// attributes when the implementation includes them inline. The Org Service SDK
    /// implementation populates them (it retrieves the full metadata in one call);
    /// the Web API implementation leaves them empty — use GetOptionsAsync there.
    /// </remarks>
    public sealed record FieldMetadata(
        string LogicalName,
        string DisplayName,
        string AttributeType,
        bool IsRequired,
        bool IsCustom,
        IReadOnlyList<OptionMetadata> Options);

    /// <summary>One option-set value. <see cref="Value"/> is the real metadata code (100000000-based).</summary>
    public sealed record OptionMetadata(int Value, string Label);

    /// <summary>Raised when metadata cannot be read. Carries context for the caller.</summary>
    public sealed class DataverseMetadataException : Exception
    {
        public string? Entity { get; }
        public string? Attribute { get; }

        public DataverseMetadataException(string message, string? entity = null, string? attribute = null, Exception? inner = null)
            : base(message, inner)
        {
            Entity = entity;
            Attribute = attribute;
        }
    }
}
