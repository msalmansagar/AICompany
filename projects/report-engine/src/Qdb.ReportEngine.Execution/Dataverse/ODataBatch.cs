using System.Text;

namespace Qdb.ReportEngine.Execution.Dataverse;

/// <summary>
/// Builds an OData <c>$batch</c> multipart body of read-only GET requests and splits the multipart
/// response back into ordered per-request payloads (ADR-RPT-008 §3 — one round-trip for
/// same-entity widgets). GET batches need no changeset; response order matches request order.
/// Pure — testable without a live CRM.
/// </summary>
public static class ODataBatch
{
    private const string Crlf = "\r\n";
    private const string PreferHeader = "odata.include-annotations=\"OData.Community.Display.V1.FormattedValue\"";

    /// <summary>Builds the multipart/mixed request body for <paramref name="requestUrls"/>, in order.</summary>
    public static string BuildRequestBody(string boundary, IReadOnlyList<string> requestUrls)
    {
        ArgumentException.ThrowIfNullOrEmpty(boundary);
        ArgumentNullException.ThrowIfNull(requestUrls);

        var builder = new StringBuilder();
        for (var index = 0; index < requestUrls.Count; index++)
        {
            builder.Append("--").Append(boundary).Append(Crlf);
            builder.Append("Content-Type: application/http").Append(Crlf);
            builder.Append("Content-Transfer-Encoding: binary").Append(Crlf);
            builder.Append("Content-ID: ").Append(index + 1).Append(Crlf).Append(Crlf);
            builder.Append("GET ").Append(requestUrls[index]).Append(" HTTP/1.1").Append(Crlf);
            builder.Append("Accept: application/json").Append(Crlf);
            builder.Append("Prefer: ").Append(PreferHeader).Append(Crlf).Append(Crlf);
        }

        builder.Append("--").Append(boundary).Append("--").Append(Crlf);
        return builder.ToString();
    }

    /// <summary>
    /// Splits a multipart <c>$batch</c> response into each part's JSON body, in order. The
    /// <paramref name="responseBoundary"/> comes from the response <c>Content-Type</c> header.
    /// </summary>
    public static IReadOnlyList<string> SplitResponseBodies(string responseBoundary, string responseBody)
    {
        ArgumentException.ThrowIfNullOrEmpty(responseBoundary);
        ArgumentNullException.ThrowIfNull(responseBody);

        var bodies = new List<string>();
        var delimiter = "--" + responseBoundary;
        var parts = responseBody.Split(delimiter, StringSplitOptions.None);
        foreach (var part in parts)
        {
            var trimmed = part.Trim();
            if (trimmed.Length == 0 || trimmed == "--")
            {
                continue; // preamble / closing delimiter
            }

            var body = ExtractBody(part);
            if (body is not null)
            {
                bodies.Add(body);
            }
        }

        return bodies;
    }

    // A part is: [part headers] \r\n\r\n [inner HTTP status + headers] \r\n\r\n [payload].
    // The payload is everything after the second blank-line separator.
    private static string? ExtractBody(string part)
    {
        var separator = Crlf + Crlf;
        var firstBlank = part.IndexOf(separator, StringComparison.Ordinal);
        if (firstBlank < 0)
        {
            return null;
        }

        var secondBlank = part.IndexOf(separator, firstBlank + separator.Length, StringComparison.Ordinal);
        if (secondBlank < 0)
        {
            return null;
        }

        var payload = part[(secondBlank + separator.Length)..].Trim();
        return payload.Length == 0 ? null : payload;
    }
}
