using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;
using Qdb.ReportEngine.Core.Common;
using Qdb.ReportEngine.Core.Models;
using Qdb.ReportEngine.Core.Security;

namespace Qdb.ReportEngine.Api.Authentication;

/// <summary>
/// Resolves which user the request executes as, once per request, before any action runs.
///
/// Centralising it here is the point: with thirteen actions all needing the same decision, a
/// per-controller helper is thirteen chances to forget the check, whereas a request that fails this
/// filter never reaches an action at all.
/// </summary>
public sealed class ResolveCallerContextFilter(
    CallerContext callerContext,
    IOptions<ReportEngineAuthOptions> authOptions) : IAsyncActionFilter
{
    /// <summary>The acting user a trusted relay names. Untrusted unless the caller proved it is one.</summary>
    public const string AssertedCallerHeader = "X-Report-Caller-Id";

    /// <summary>Legacy spelling accepted for the same purpose.</summary>
    private const string LegacyAssertedCallerHeader = "MSCRMCallerID";

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var principal = CallerPrincipalProjection.FromClaims(context.HttpContext.User);
        var resolved = CallerIdentityPolicy.ResolveEffectiveUserId(principal, ReadAssertedCallerId(context.HttpContext));

        if (!resolved.IsSuccess)
        {
            context.Result = Reject(resolved.Error!);
            return;
        }

        callerContext.Value = ReportExecutionContext.ForUser(resolved.Value);
        await next();
    }

    private string? ReadAssertedCallerId(HttpContext httpContext)
    {
        var headers = httpContext.Request.Headers;
        var asserted = headers[AssertedCallerHeader].FirstOrDefault()
            ?? headers[LegacyAssertedCallerHeader].FirstOrDefault();

        return string.IsNullOrWhiteSpace(asserted) ? DevelopmentFallback(httpContext) : asserted;
    }

    /// <summary>
    /// Lets a local run work without setting a header, but only for a request the Development-only
    /// scheme authenticated — so a stray configured value can never stand in for a real caller on a
    /// deployment where that scheme is not even registered.
    /// </summary>
    private string? DevelopmentFallback(HttpContext httpContext)
    {
        var isDevelopmentScheme = httpContext.User.Identity?.AuthenticationType
            == DevelopmentAnonymousDefaults.AuthenticationScheme;
        var developmentCallerId = authOptions.Value.DevelopmentCallerId;

        return isDevelopmentScheme && developmentCallerId != Guid.Empty
            ? developmentCallerId.ToString()
            : null;
    }

    private static ObjectResult Reject(DomainError error) => new(new { error.Code, error.Message })
    {
        StatusCode = error.Code switch
        {
            "unauthenticated" => StatusCodes.Status401Unauthorized,
            "impersonation_not_permitted" => StatusCodes.Status403Forbidden,
            _ => StatusCodes.Status400BadRequest
        }
    };
}
