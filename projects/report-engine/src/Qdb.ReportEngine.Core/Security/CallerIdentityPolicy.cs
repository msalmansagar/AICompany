using Qdb.ReportEngine.Core.Common;

namespace Qdb.ReportEngine.Core.Security;

/// <summary>
/// Decides which user a request executes as (B1). The engine impersonates that user in Dataverse,
/// so this single decision is what stands between a caller and another user's data.
///
/// The rule is that an acting user may only be *named* by a caller that was itself authenticated as
/// a trusted service — a CRM entry point, which established the user's identity from the CRM session
/// before relaying. Any other caller acts strictly as the subject of its own validated token, which
/// is why an unauthenticated request can no longer choose an identity at all.
/// </summary>
public static class CallerIdentityPolicy
{
    /// <summary>
    /// Resolves the user the request executes as, or the reason it may not execute.
    /// </summary>
    /// <param name="principal">The validated caller.</param>
    /// <param name="assertedCallerId">
    /// The acting user the caller named (the <c>X-Report-Caller-Id</c> header). Untrusted on its own —
    /// honoured only when <paramref name="principal"/> is a trusted service identity.
    /// </param>
    public static Result<Guid> ResolveEffectiveUserId(CallerPrincipal principal, string? assertedCallerId)
    {
        if (!principal.IsAuthenticated)
        {
            return Result<Guid>.Failure(DomainError.Unauthenticated());
        }

        return principal.CanAssertCaller
            ? ResolveAssertedUser(assertedCallerId)
            : ResolveTokenSubject(principal.SubjectId, assertedCallerId);
    }

    /// <summary>
    /// A trusted relay must always name the acting user. It is never allowed to fall back to its own
    /// service identity, which would run the report with the service account's privileges and
    /// silently bypass the row-level security the whole per-user execution model depends on.
    /// </summary>
    private static Result<Guid> ResolveAssertedUser(string? assertedCallerId)
    {
        if (!Guid.TryParse(assertedCallerId, out var assertedUserId) || assertedUserId == Guid.Empty)
        {
            return Result<Guid>.Failure(
                DomainError.Invalid("A trusted caller must name the acting user in X-Report-Caller-Id."));
        }

        return Result<Guid>.Success(assertedUserId);
    }

    private static Result<Guid> ResolveTokenSubject(Guid? subjectId, string? assertedCallerId)
    {
        if (subjectId is not { } subject || subject == Guid.Empty)
        {
            return Result<Guid>.Failure(
                DomainError.Invalid("The access token carries no usable subject claim."));
        }

        var namesAnotherUser = Guid.TryParse(assertedCallerId, out var assertedUserId) && assertedUserId != subject;
        return namesAnotherUser
            ? Result<Guid>.Failure(DomainError.ImpersonationNotPermitted())
            : Result<Guid>.Success(subject);
    }
}
