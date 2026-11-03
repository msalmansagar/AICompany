namespace Qdb.ReportEngine.Api.Authentication;

/// <summary>Claim types and scheme names the engine's own authentication introduces.</summary>
public static class ReportEngineClaims
{
    /// <summary>
    /// Present only on a trusted service identity. Its presence is what lets a caller name the
    /// acting user, so it must never be issued by a scheme that validates anything less than a
    /// secret the CRM entry point alone holds.
    /// </summary>
    public const string CanAssertCaller = "qdb:can_assert_caller";
}

/// <summary>Constants for the shared-secret service scheme used by CRM entry points.</summary>
public static class ServiceTokenDefaults
{
    /// <summary>Scheme name, and the <c>Authorization</c> header prefix callers present.</summary>
    public const string AuthenticationScheme = "ServiceToken";
}

/// <summary>Constants for the Development-only scheme that authenticates every request.</summary>
public static class DevelopmentAnonymousDefaults
{
    public const string AuthenticationScheme = "DevelopmentAnonymous";
}
