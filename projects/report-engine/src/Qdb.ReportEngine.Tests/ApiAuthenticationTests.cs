using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Qdb.ReportEngine.Tests;

/// <summary>
/// Boots the real request pipeline to prove the B1 guarantee end-to-end: the policy being correct is
/// not enough if a route is reachable without passing through it.
/// </summary>
public sealed class ApiAuthenticationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string ServiceSecret = "test-service-secret";
    private static readonly Guid ActingUser = Guid.Parse("aaaaaaaa-1111-2222-3333-444444444444");

    private readonly WebApplicationFactory<Program> _factory;

    public ApiAuthenticationTests(WebApplicationFactory<Program> factory) => _factory = factory
        .WithWebHostBuilder(builder =>
        {
            // UseSetting, not ConfigureAppConfiguration: the top-level Program reads its
            // configuration while the host is being built, before that callback would run.
            builder.UseEnvironment(Environments.Development);
            builder.UseSetting("Auth:ServiceToken:Enabled", "true");
            builder.UseSetting("Auth:ServiceToken:Secret", ServiceSecret);
            builder.UseSetting("Auth:AllowAnonymousDevelopment", "false");
        });

    private HttpClient CreateClient() => _factory.CreateClient();

    private static void AuthenticateAsRelay(HttpClient client, string secret = ServiceSecret) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("ServiceToken", secret);

    [Fact]
    public async Task GetReports_WithoutCredentials_IsUnauthorized()
    {
        var response = await CreateClient().GetAsync("/api/reports");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetDashboards_WithoutCredentials_IsUnauthorized()
    {
        var response = await CreateClient().GetAsync("/api/dashboards");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetReports_WithForgedCallerHeaderOnly_IsUnauthorized()
    {
        // The pre-B1 request shape: a caller id and nothing else. It must no longer be enough.
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Report-Caller-Id", ActingUser.ToString());

        var response = await client.GetAsync("/api/reports");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetReports_WithWrongServiceSecret_IsUnauthorized()
    {
        var client = CreateClient();
        AuthenticateAsRelay(client, "not-the-secret");
        client.DefaultRequestHeaders.Add("X-Report-Caller-Id", ActingUser.ToString());

        var response = await client.GetAsync("/api/reports");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetReports_WithValidRelayButNoNamedUser_IsBadRequest()
    {
        var client = CreateClient();
        AuthenticateAsRelay(client);

        var response = await client.GetAsync("/api/reports");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GetReports_WithValidRelayNamingUser_PassesAuthentication()
    {
        var client = CreateClient();
        AuthenticateAsRelay(client);
        client.DefaultRequestHeaders.Add("X-Report-Caller-Id", ActingUser.ToString());

        var response = await client.GetAsync("/api/reports");

        // The stub Dataverse backend decides what comes back; all that matters here is that the
        // request was admitted rather than rejected at the boundary.
        Assert.NotEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.NotEqual(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Health_IsReachableWithoutCredentials()
    {
        var response = await CreateClient().GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
