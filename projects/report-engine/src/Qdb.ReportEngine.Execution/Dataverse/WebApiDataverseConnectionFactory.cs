using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Configuration;
using Qdb.ReportEngine.Core.Models;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Builds live Dataverse Web API connections. Acquires a token via <see cref="IDataverseTokenProvider"/>
/// (app-only today; OBO once AUTH-C-2 lands) and hands the authenticated <see cref="HttpClient"/> to a
/// <see cref="DataverseWebApiConnection"/>. On-prem 9.x (Organization Service impersonation) is a later
/// increment and is rejected explicitly rather than falling back silently (ADR-RPT-008 §1).
/// </summary>
public sealed class WebApiDataverseConnectionFactory(
    IHttpClientFactory httpClientFactory,
    IDataverseTokenProvider tokenProvider,
    IEntitySetResolver entitySetResolver,
    IOptions<DataverseOptions> dataverseOptions,
    IOptions<DashboardOptions> dashboardOptions) : IDataverseConnectionFactory
{
    private readonly DataverseOptions _dataverse = dataverseOptions.Value;
    private readonly DeploymentTarget _target = dashboardOptions.Value.Target;

    /// <inheritdoc />
    public async Task<IDataverseConnection> CreateForUserAsync(ReportExecutionContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        if (_target == DeploymentTarget.OnPremise)
        {
            throw new NotSupportedException("On-premise Organization Service execution is a later increment; use the cloud Web API target.");
        }

        var token = await tokenProvider.GetAccessTokenAsync(context, cancellationToken).ConfigureAwait(false);
        var client = httpClientFactory.CreateClient();
        client.BaseAddress = new Uri(_dataverse.Url.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        return new DataverseWebApiConnection(client, entitySetResolver, _dataverse.ApiVersion, context.UserId);
    }
}
