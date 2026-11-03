using System.Security.Claims;
using Qdb.ReportEngine.Core.Security;

namespace Qdb.ReportEngine.Api.Authentication;

/// <summary>
/// Reduces the ASP.NET <see cref="ClaimsPrincipal"/> to the transport-free
/// <see cref="CallerPrincipal"/> the impersonation policy decides on.
/// </summary>
public static class CallerPrincipalProjection
{
    /// <summary>Entra ID object id, as emitted when inbound claim mapping is disabled.</summary>
    private const string ObjectIdClaim = "oid";

    /// <summary>Entra ID object id, as emitted under the default WS-Federation claim mapping.</summary>
    private const string MappedObjectIdClaim = "http://schemas.microsoft.com/identity/claims/objectidentifier";

    public static CallerPrincipal FromClaims(ClaimsPrincipal user) => new()
    {
        IsAuthenticated = user.Identity?.IsAuthenticated == true,
        CanAssertCaller = user.HasClaim(ReportEngineClaims.CanAssertCaller, "true"),
        SubjectId = ReadSubjectId(user)
    };

    /// <summary>
    /// Reads the caller's own user id. The Entra object id is preferred because it is the identifier
    /// Dataverse matches a systemuser on; <c>sub</c> is pairwise per-application and would not.
    /// </summary>
    private static Guid? ReadSubjectId(ClaimsPrincipal user)
    {
        var objectId = user.FindFirstValue(ObjectIdClaim)
            ?? user.FindFirstValue(MappedObjectIdClaim)
            ?? user.FindFirstValue(ClaimTypes.NameIdentifier);

        return Guid.TryParse(objectId, out var subjectId) ? subjectId : null;
    }
}
