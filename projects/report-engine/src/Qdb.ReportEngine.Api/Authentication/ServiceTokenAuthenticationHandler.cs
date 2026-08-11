using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Qdb.ReportEngine.Api.Authentication;

/// <summary>
/// Authenticates a CRM entry point presenting <c>Authorization: ServiceToken &lt;secret&gt;</c>.
///
/// This is the on-premise path, where no Entra tenant exists to issue tokens: the plugin establishes
/// the user's identity from the CRM session, then relays with this credential and names that user.
/// A caller that clears this check is trusted to name the acting user, which is exactly the power
/// the forgeable header used to hand out for free.
/// </summary>
public sealed class ServiceTokenAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IOptions<ReportEngineAuthOptions> authOptions)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    private readonly ServiceTokenOptions _serviceToken = authOptions.Value.ServiceToken;

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!TryReadPresentedSecret(out var presentedSecret))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        if (string.IsNullOrEmpty(_serviceToken.Secret) || !IsExpectedSecret(presentedSecret))
        {
            // Deliberately unspecific: distinguishing "no secret configured" from "wrong secret"
            // would tell an attacker whether the scheme is live on this deployment.
            return Task.FromResult(AuthenticateResult.Fail("Invalid service token."));
        }

        return Task.FromResult(AuthenticateResult.Success(BuildTicket()));
    }

    /// <summary>Reads the secret from the Authorization header, or false when this scheme was not used.</summary>
    private bool TryReadPresentedSecret(out string presentedSecret)
    {
        presentedSecret = string.Empty;
        var header = Request.Headers.Authorization.FirstOrDefault();
        var prefix = ServiceTokenDefaults.AuthenticationScheme + " ";

        if (header is null || !header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        presentedSecret = header[prefix.Length..].Trim();
        return presentedSecret.Length > 0;
    }

    /// <summary>Compares in fixed time so the secret cannot be recovered byte-by-byte by timing.</summary>
    private bool IsExpectedSecret(string presentedSecret) => CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(presentedSecret),
        Encoding.UTF8.GetBytes(_serviceToken.Secret!));

    private AuthenticationTicket BuildTicket()
    {
        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.Name, ServiceTokenDefaults.AuthenticationScheme),
                new Claim(ReportEngineClaims.CanAssertCaller, "true")
            ],
            ServiceTokenDefaults.AuthenticationScheme);

        return new AuthenticationTicket(new ClaimsPrincipal(identity), ServiceTokenDefaults.AuthenticationScheme);
    }
}
