using System.Net;
using System.Net.Http.Headers;
using Qdb.ReportEngine.Core.Abstractions;
using Qdb.ReportEngine.Core.Common;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// A Dataverse Web API connection that executes FetchXML over HTTP as the token's identity.
/// Single queries hit <c>GET /{entityset}?fetchXml=…</c>; batched queries use one OData
/// <c>$batch</c> POST (ADR-RPT-008 §3). HTTP 429 surfaces as <see cref="DataverseThrottledException"/>
/// so the resilience policy honours <c>Retry-After</c>. The <see cref="HttpClient"/> is owned and
/// disposed by this connection.
/// </summary>
public sealed class DataverseWebApiConnection(
    HttpClient httpClient,
    IEntitySetResolver entitySetResolver,
    string apiVersion,
    Guid executingUserId) : IDataverseConnection
{
    private const string IncludeFormattedValues = "odata.include-annotations=\"OData.Community.Display.V1.FormattedValue\"";

    /// <inheritdoc />
    public Guid ExecutingUserId { get; } = executingUserId;

    /// <inheritdoc />
    public async Task<IReadOnlyList<IReadOnlyDictionary<string, object?>>> RetrieveMultipleAsync(
        string entityLogicalName, string fetchXml, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(entityLogicalName);
        ArgumentException.ThrowIfNullOrEmpty(fetchXml);

        var path = await BuildFetchPathAsync(entityLogicalName, fetchXml, cancellationToken).ConfigureAwait(false);
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.TryAddWithoutValidation("Prefer", IncludeFormattedValues);
        ApplyImpersonation(request);

        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessOrThrottleAsync(response, entityLogicalName, cancellationToken).ConfigureAwait(false);

        var json = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        return ODataJson.ReadValueRows(json);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyDictionary<Guid, IReadOnlyList<IReadOnlyDictionary<string, object?>>>> RetrieveMultipleBatchAsync(
        IReadOnlyList<BatchQuery> queries, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(queries);
        if (queries.Count == 0)
        {
            return new Dictionary<Guid, IReadOnlyList<IReadOnlyDictionary<string, object?>>>();
        }

        // Batch inner requests must carry absolute URLs — a relative path is resolved against the
        // $batch service root and rejected. The single-GET path resolves via HttpClient.BaseAddress.
        var baseUri = httpClient.BaseAddress?.AbsoluteUri
            ?? throw new InvalidOperationException("Connection HttpClient has no base address.");
        var urls = new List<string>(queries.Count);
        foreach (var query in queries)
        {
            var relative = await BuildFetchPathAsync(query.EntityLogicalName, query.FetchXml, cancellationToken).ConfigureAwait(false);
            urls.Add(baseUri + relative);
        }

        var boundary = "batch_" + Guid.NewGuid().ToString("N");
        var body = ODataBatch.BuildRequestBody(boundary, urls);
        using var content = new StringContent(body);
        content.Headers.ContentType = new MediaTypeHeaderValue("multipart/mixed") { Parameters = { new NameValueHeaderValue("boundary", boundary) } };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"api/data/{apiVersion}/$batch") { Content = content };
        ApplyImpersonation(request);
        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessOrThrottleAsync(response, queries[0].EntityLogicalName, cancellationToken).ConfigureAwait(false);

        var responseBoundary = ReadResponseBoundary(response.Content.Headers.ContentType);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        var bodies = ODataBatch.SplitResponseBodies(responseBoundary, payload);

        return CorrelateByOrder(queries, bodies);
    }

    /// <inheritdoc />
    public async Task CreateAsync(string entityLogicalName, IReadOnlyDictionary<string, object?> attributes, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(entityLogicalName);
        ArgumentNullException.ThrowIfNull(attributes);

        var entitySet = await entitySetResolver.ResolveAsync(entityLogicalName, cancellationToken).ConfigureAwait(false);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"api/data/{apiVersion}/{entitySet}")
        {
            Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(attributes), System.Text.Encoding.UTF8, "application/json")
        };
        ApplyImpersonation(request);

        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessOrThrottleAsync(response, entityLogicalName, cancellationToken).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public ValueTask DisposeAsync()
    {
        httpClient.Dispose();
        return ValueTask.CompletedTask;
    }

    private async Task<string> BuildFetchPathAsync(string entityLogicalName, string fetchXml, CancellationToken cancellationToken)
    {
        var entitySet = await entitySetResolver.ResolveAsync(entityLogicalName, cancellationToken).ConfigureAwait(false);
        return $"api/data/{apiVersion}/{entitySet}?fetchXml={Uri.EscapeDataString(fetchXml)}";
    }

    private static Dictionary<Guid, IReadOnlyList<IReadOnlyDictionary<string, object?>>> CorrelateByOrder(
        IReadOnlyList<BatchQuery> queries, IReadOnlyList<string> bodies)
    {
        var results = new Dictionary<Guid, IReadOnlyList<IReadOnlyDictionary<string, object?>>>(queries.Count);
        for (var index = 0; index < queries.Count; index++)
        {
            var rows = index < bodies.Count
                ? ODataJson.ReadValueRows(bodies[index])
                : [];
            results[queries[index].WidgetId] = rows;
        }

        return results;
    }

    private static string ReadResponseBoundary(MediaTypeHeaderValue? contentType)
    {
        var boundary = contentType?.Parameters
            .FirstOrDefault(p => string.Equals(p.Name, "boundary", StringComparison.OrdinalIgnoreCase))?.Value;
        if (string.IsNullOrEmpty(boundary))
        {
            throw new InvalidOperationException("Batch response is missing a multipart boundary.");
        }

        return boundary.Trim('"');
    }

    // Runs the request as the report's user (row-level security applies), when a user is set.
    // The middle-tier's identity must hold "Act on Behalf of Another User" for this to be honoured.
    private void ApplyImpersonation(HttpRequestMessage request)
    {
        if (ExecutingUserId != Guid.Empty)
        {
            request.Headers.TryAddWithoutValidation("MSCRMCallerID", ExecutingUserId.ToString());
        }
    }

    private static async Task EnsureSuccessOrThrottleAsync(HttpResponseMessage response, string entity, CancellationToken cancellationToken)
    {
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
        {
            var retryAfter = response.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(10);
            throw new DataverseThrottledException(retryAfter);
        }

        if (response.StatusCode == HttpStatusCode.Forbidden)
        {
            throw new DataverseAccessDeniedException(entity);
        }

        if (!response.IsSuccessStatusCode)
        {
            // Do not surface the raw OData error body — it can carry schema/query detail that would
            // then land in application logs (which have broader read access than the data itself).
            throw new HttpRequestException($"Dataverse request failed with status {(int)response.StatusCode}.");
        }
    }
}
