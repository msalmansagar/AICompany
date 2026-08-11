using Qdb.ReportEngine.Core.Security;
using Xunit;

namespace Qdb.ReportEngine.Tests;

/// <summary>
/// The B1 decision: who a request executes as. Every case here is one an attacker would probe, so
/// the assertions are about what is refused as much as what is allowed.
/// </summary>
public sealed class CallerIdentityPolicyTests
{
    private static readonly Guid ActingUser = Guid.Parse("aaaaaaaa-1111-2222-3333-444444444444");
    private static readonly Guid OtherUser = Guid.Parse("bbbbbbbb-1111-2222-3333-444444444444");

    private static CallerPrincipal Anonymous() => new() { IsAuthenticated = false };

    private static CallerPrincipal TrustedRelay() => new() { IsAuthenticated = true, CanAssertCaller = true };

    private static CallerPrincipal TokenUser(Guid subjectId) =>
        new() { IsAuthenticated = true, SubjectId = subjectId };

    [Fact]
    public void ResolveEffectiveUserId_Unauthenticated_IsRefused()
    {
        var result = CallerIdentityPolicy.ResolveEffectiveUserId(Anonymous(), ActingUser.ToString());

        Assert.False(result.IsSuccess);
        Assert.Equal("unauthenticated", result.Error!.Code);
    }

    [Fact]
    public void ResolveEffectiveUserId_UnauthenticatedWithAssertedCaller_DoesNotHonourTheHeader()
    {
        // The pre-B1 hole: a header alone chose the identity.
        var result = CallerIdentityPolicy.ResolveEffectiveUserId(Anonymous(), OtherUser.ToString());

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public void ResolveEffectiveUserId_TrustedRelayNamingUser_ActsAsThatUser()
    {
        var result = CallerIdentityPolicy.ResolveEffectiveUserId(TrustedRelay(), ActingUser.ToString());

        Assert.True(result.IsSuccess);
        Assert.Equal(ActingUser, result.Value);
    }

    [Fact]
    public void ResolveEffectiveUserId_TrustedRelayNamingNobody_IsRefused()
    {
        // Falling back to the service identity would run the report with service privileges.
        var result = CallerIdentityPolicy.ResolveEffectiveUserId(TrustedRelay(), assertedCallerId: null);

        Assert.False(result.IsSuccess);
        Assert.Equal("invalid_request", result.Error!.Code);
    }

    [Fact]
    public void ResolveEffectiveUserId_TrustedRelayNamingEmptyGuid_IsRefused()
    {
        var result = CallerIdentityPolicy.ResolveEffectiveUserId(TrustedRelay(), Guid.Empty.ToString());

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public void ResolveEffectiveUserId_TokenUser_ActsAsTokenSubject()
    {
        var result = CallerIdentityPolicy.ResolveEffectiveUserId(TokenUser(ActingUser), assertedCallerId: null);

        Assert.True(result.IsSuccess);
        Assert.Equal(ActingUser, result.Value);
    }

    [Fact]
    public void ResolveEffectiveUserId_TokenUserNamingAnotherUser_IsRefused()
    {
        var result = CallerIdentityPolicy.ResolveEffectiveUserId(TokenUser(ActingUser), OtherUser.ToString());

        Assert.False(result.IsSuccess);
        Assert.Equal("impersonation_not_permitted", result.Error!.Code);
    }

    [Fact]
    public void ResolveEffectiveUserId_TokenUserNamingItself_IsAllowed()
    {
        var result = CallerIdentityPolicy.ResolveEffectiveUserId(TokenUser(ActingUser), ActingUser.ToString());

        Assert.True(result.IsSuccess);
        Assert.Equal(ActingUser, result.Value);
    }

    [Fact]
    public void ResolveEffectiveUserId_TokenWithoutSubject_IsRefused()
    {
        var principal = new CallerPrincipal { IsAuthenticated = true, SubjectId = null };

        var result = CallerIdentityPolicy.ResolveEffectiveUserId(principal, assertedCallerId: null);

        Assert.False(result.IsSuccess);
        Assert.Equal("invalid_request", result.Error!.Code);
    }
}
