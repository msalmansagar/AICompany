using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;

namespace Qdb.ReportEngine.Api.Authentication;

/// <summary>
/// Registers the middle-tier's authentication (B1). Every endpoint requires an authenticated caller
/// by default, and a deployment that configures no way to authenticate fails to start rather than
/// serving an open API — the same posture the CORS guard already takes.
/// </summary>
public static class AuthenticationServiceCollectionExtensions
{
    /// <summary>Dispatches each request to the scheme its Authorization header indicates.</summary>
    private const string SelectorScheme = "ReportEngineSelector";

    public static IServiceCollection AddReportEngineAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var section = configuration.GetSection(ReportEngineAuthOptions.SectionName);
        var options = section.Get<ReportEngineAuthOptions>() ?? new ReportEngineAuthOptions();
        services.Configure<ReportEngineAuthOptions>(section);

        var allowAnonymous = ResolveAnonymousDevelopment(options, environment);
        GuardConfiguration(options, allowAnonymous);
        RegisterSchemes(services, options, allowAnonymous);

        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
        services.AddScoped<CallerContext>();
        return services;
    }

    /// <summary>
    /// A deployment cannot opt out of authentication by environment alone: asking for the anonymous
    /// scheme outside Development is treated as a deployment error, not quietly downgraded.
    /// </summary>
    private static bool ResolveAnonymousDevelopment(ReportEngineAuthOptions options, IHostEnvironment environment)
    {
        if (!options.AllowAnonymousDevelopment)
        {
            return false;
        }

        if (!environment.IsDevelopment())
        {
            throw new InvalidOperationException(
                "Auth:AllowAnonymousDevelopment is only permitted in the Development environment.");
        }

        return true;
    }

    private static void GuardConfiguration(ReportEngineAuthOptions options, bool allowAnonymous)
    {
        if (!allowAnonymous && !options.EntraJwt.Enabled && !options.ServiceToken.Enabled)
        {
            throw new InvalidOperationException(
                "No authentication scheme is configured. Enable Auth:EntraJwt or Auth:ServiceToken.");
        }

        GuardEntraJwt(options.EntraJwt);
        GuardServiceToken(options.ServiceToken);
    }

    private static void GuardEntraJwt(EntraJwtOptions entraJwt)
    {
        if (entraJwt.Enabled && (string.IsNullOrWhiteSpace(entraJwt.Authority) || string.IsNullOrWhiteSpace(entraJwt.Audience)))
        {
            throw new InvalidOperationException(
                "Auth:EntraJwt requires both Authority and Audience — an unvalidated audience accepts tokens minted for other APIs.");
        }
    }

    private static void GuardServiceToken(ServiceTokenOptions serviceToken)
    {
        if (serviceToken.Enabled && string.IsNullOrWhiteSpace(serviceToken.Secret))
        {
            throw new InvalidOperationException(
                "Auth:ServiceToken requires a Secret, supplied by environment variable or user-secrets.");
        }
    }

    private static void RegisterSchemes(IServiceCollection services, ReportEngineAuthOptions options, bool allowAnonymous)
    {
        var builder = services.AddAuthentication(SelectorScheme);
        builder.AddPolicyScheme(SelectorScheme, SelectorScheme, scheme =>
            scheme.ForwardDefaultSelector = context => SelectScheme(context, options, allowAnonymous));

        if (options.ServiceToken.Enabled)
        {
            builder.AddScheme<AuthenticationSchemeOptions, ServiceTokenAuthenticationHandler>(
                ServiceTokenDefaults.AuthenticationScheme, configureOptions: null);
        }

        if (options.EntraJwt.Enabled)
        {
            builder.AddJwtBearer(jwt =>
            {
                jwt.Authority = options.EntraJwt.Authority;
                jwt.Audience = options.EntraJwt.Audience;
                jwt.TokenValidationParameters.ValidateIssuer = true;
                jwt.TokenValidationParameters.ValidateAudience = true;
            });
        }

        if (allowAnonymous)
        {
            builder.AddScheme<AuthenticationSchemeOptions, DevelopmentAnonymousAuthenticationHandler>(
                DevelopmentAnonymousDefaults.AuthenticationScheme, configureOptions: null);
        }
    }

    /// <summary>
    /// Picks the scheme from the credential actually presented. When none matches, the request still
    /// has to land on a registered scheme so that it is challenged with a 401 rather than throwing.
    /// </summary>
    private static string SelectScheme(HttpContext context, ReportEngineAuthOptions options, bool allowAnonymous)
    {
        var header = context.Request.Headers.Authorization.FirstOrDefault();

        if (options.ServiceToken.Enabled && StartsWithScheme(header, ServiceTokenDefaults.AuthenticationScheme))
        {
            return ServiceTokenDefaults.AuthenticationScheme;
        }

        if (options.EntraJwt.Enabled && StartsWithScheme(header, JwtBearerDefaults.AuthenticationScheme))
        {
            return JwtBearerDefaults.AuthenticationScheme;
        }

        return allowAnonymous ? DevelopmentAnonymousDefaults.AuthenticationScheme : ChallengeScheme(options);
    }

    private static bool StartsWithScheme(string? header, string scheme) =>
        header?.StartsWith(scheme + " ", StringComparison.OrdinalIgnoreCase) == true;

    private static string ChallengeScheme(ReportEngineAuthOptions options) => options.EntraJwt.Enabled
        ? JwtBearerDefaults.AuthenticationScheme
        : ServiceTokenDefaults.AuthenticationScheme;
}
