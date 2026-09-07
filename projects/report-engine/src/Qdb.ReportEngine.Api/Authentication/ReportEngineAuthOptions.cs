namespace Qdb.ReportEngine.Api.Authentication;

/// <summary>
/// How callers authenticate to the middle-tier, bound from the <c>Auth</c> configuration section.
///
/// Two schemes exist because the engine ships to two targets that authenticate differently
/// (phase-3-arch.md §364): Dataverse cloud issues Entra ID tokens, while on-premise CRM 9.x has no
/// Entra tenant and instead relays through a CRM entry point holding a service credential. Both may
/// be enabled at once — a single deployment can serve a cloud org and an on-prem org.
/// </summary>
public sealed class ReportEngineAuthOptions
{
    public const string SectionName = "Auth";

    /// <summary>Entra ID bearer tokens — the cloud path.</summary>
    public EntraJwtOptions EntraJwt { get; init; } = new();

    /// <summary>Shared-secret service credential for CRM entry points — the on-premise path.</summary>
    public ServiceTokenOptions ServiceToken { get; init; } = new();

    /// <summary>
    /// Treats every request as a trusted relay so local work needs no token. Refused outside the
    /// Development environment by <see cref="AuthenticationServiceCollectionExtensions"/>.
    /// </summary>
    public bool AllowAnonymousDevelopment { get; init; }

    /// <summary>
    /// The user anonymous development requests act as, so a local run behaves like a real one
    /// (impersonating a genuine CRM user) rather than silently running with service privileges.
    /// </summary>
    public Guid DevelopmentCallerId { get; init; }
}

/// <summary>Entra ID JWT validation settings.</summary>
public sealed class EntraJwtOptions
{
    public bool Enabled { get; init; }

    /// <summary>Token issuer, e.g. <c>https://login.microsoftonline.com/{tenantId}/v2.0</c>.</summary>
    public string? Authority { get; init; }

    /// <summary>The application ID URI or client id this API accepts tokens for.</summary>
    public string? Audience { get; init; }
}

/// <summary>Shared-secret settings for a trusted CRM entry point.</summary>
public sealed class ServiceTokenOptions
{
    public bool Enabled { get; init; }

    /// <summary>
    /// The shared secret, supplied by environment variable or user-secrets — never committed.
    /// A caller presenting it may name the acting user, so it is a high-value credential.
    /// </summary>
    public string? Secret { get; init; }
}
