using Microsoft.Extensions.Options;
using Microsoft.Identity.Client;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Acquires Dataverse tokens with MSAL. Currently app-only (client-credentials) so the whole
/// data path is exercisable before OBO is enabled; the OBO branch (ADR-RPT-008 §1) is a token
/// exchange added here once AUTH-C-2 (permitted Azure region) is confirmed — callers are unaffected.
/// MSAL caches tokens internally, so this is safe to hold as a singleton.
/// </summary>
public sealed class MsalTokenProvider : IDataverseTokenProvider
{
    private readonly IConfidentialClientApplication _application;
    private readonly string[] _scopes;

    /// <summary>Creates the provider from validated <see cref="DataverseOptions"/>.</summary>
    public MsalTokenProvider(IOptions<DataverseOptions> options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var settings = options.Value;
        if (!settings.IsConfigured)
        {
            throw new InvalidOperationException("Dataverse connection is not configured (Url/TenantId/ClientId/ClientSecret).");
        }

        _application = ConfidentialClientApplicationBuilder
            .Create(settings.ClientId)
            .WithClientSecret(settings.ClientSecret)
            .WithAuthority(AzureCloudInstance.AzurePublic, settings.TenantId)
            .Build();
        _scopes = [$"{settings.Url.TrimEnd('/')}/.default"];
    }

    /// <inheritdoc />
    public async Task<string> GetAccessTokenAsync(ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);

        // TODO(AUTH-C-2): when the delegated token is present and OBO is enabled, exchange
        // context.DelegatedToken here via AcquireTokenOnBehalfOf so queries run as the user.
        var result = await _application
            .AcquireTokenForClient(_scopes)
            .ExecuteAsync(cancellationToken)
            .ConfigureAwait(false);

        return result.AccessToken;
    }
}
