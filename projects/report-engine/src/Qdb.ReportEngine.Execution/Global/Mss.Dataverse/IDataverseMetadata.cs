namespace Mss.Dataverse;

/// <summary>
/// Canonical Dataverse metadata contract for the .NET runtime — MSS Technologies
/// global library. The C# sibling of @mss/dataverse-metadata. Serves .NET
/// consumers (middle-tier services, and — via a future Org Service SDK
/// implementation — plugins) that cannot use the TypeScript package.
///
/// Embeds the platform rules so no caller re-learns them: entity metadata is
/// read by a DIRECT EntityDefinitions(LogicalName='x') lookup (never a filtered
/// scan, which is silently paginated); option-set values are the real
/// 100000000-based codes from metadata, never assumed 0-based ordinals.
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
public sealed record FieldMetadata(
    string LogicalName,
    string DisplayName,
    string AttributeType,
    bool IsRequired,
    bool IsCustom);

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
