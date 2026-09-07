using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Qdb.ReportEngine.Api.Authentication;

/// <summary>
/// Authenticates every request as a trusted relay so a developer can drive the designer and runtime
/// web resources locally without standing up a token issuer.
///
/// This scheme defeats B1 by design, so it is never merely "off by default": registering it at all
/// requires <c>Auth:AllowAnonymousDevelopment</c> AND the Development environment, enforced at
/// startup in <see cref="AuthenticationServiceCollectionExtensions"/>.
/// </summary>
public sealed class DevelopmentAnonymousAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.Name, DevelopmentAnonymousDefaults.AuthenticationScheme),
                new Claim(ReportEngineClaims.CanAssertCaller, "true")
            ],
            DevelopmentAnonymousDefaults.AuthenticationScheme);

        var ticket = new AuthenticationTicket(
            new ClaimsPrincipal(identity),
            DevelopmentAnonymousDefaults.AuthenticationScheme);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
