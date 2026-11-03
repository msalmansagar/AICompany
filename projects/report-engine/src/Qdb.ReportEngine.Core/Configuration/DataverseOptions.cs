namespace Qdb.ReportEngine.Core.Configuration;

/// <summary>
/// Connection settings for the Dataverse Web API. Bound from the <c>Dataverse</c> configuration
/// section. Secrets must come from environment/user-secrets, never committed configuration.
/// </summary>
public sealed class DataverseOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Dataverse";

    /// <summary>Environment URL, e.g. <c>https://org5869857f.crm4.dynamics.com</c>.</summary>
    public string Url { get; init; } = string.Empty;

    /// <summary>Azure AD tenant id (cloud auth).</summary>
    public string TenantId { get; init; } = string.Empty;

    /// <summary>Application (client) id used for token acquisition.</summary>
    public string ClientId { get; init; } = string.Empty;

    /// <summary>
    /// Client secret for app-only (client-credentials) execution used until OBO is enabled
    /// (AUTH-C-2, permitted Azure region). Supplied via environment/user-secrets.
    /// </summary>
    public string ClientSecret { get; init; } = string.Empty;

    /// <summary>Web API version segment. Default <c>v9.2</c>.</summary>
    public string ApiVersion { get; init; } = "v9.2";

    /// <summary>True once the URL and auth settings are present.</summary>
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Url)
        && !string.IsNullOrWhiteSpace(TenantId)
        && !string.IsNullOrWhiteSpace(ClientId)
        && !string.IsNullOrWhiteSpace(ClientSecret);
}
