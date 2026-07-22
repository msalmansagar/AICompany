using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using Qdb.ReportEngine.CrmPlugin.Model;

namespace Qdb.ReportEngine.CrmPlugin.Infrastructure
{
    /// <summary>
    /// Relays a run to the middle tier over HTTPS. A run hits <c>/execute</c> (JSON rows); an export
    /// hits <c>/export?format=</c> and the file is base64-encoded into the payload. The caller id is
    /// passed as <c>X-Report-Caller-Id</c> so the middle tier executes with that user's row-level
    /// security (impersonation). TODO(B1): mint a validated bearer token here instead of trusting a
    /// header, once the auth scheme is confirmed.
    /// </summary>
    internal static class MiddleTierClient
    {
        // A single shared HttpClient — plugins are pooled and reused, so a per-call client would leak sockets.
        private static readonly HttpClient Http = new HttpClient();

        public static RelayResult Run(PluginConfiguration configuration, RunReportRequest request)
        {
            using (var message = BuildMessage(configuration.MiddleTierUrl, request))
            using (var cancellation = new CancellationTokenSource(configuration.SyncTimeoutMs))
            {
                try
                {
                    var response = Http.SendAsync(message, cancellation.Token).GetAwaiter().GetResult();
                    return ReadResponse(response, request.Format);
                }
                catch (OperationCanceledException)
                {
                    return RelayResult.Timeout();
                }
                catch (HttpRequestException error)
                {
                    return RelayResult.Failure("middle_tier_unreachable", error.Message);
                }
            }
        }

        private static HttpRequestMessage BuildMessage(string baseUrl, RunReportRequest request)
        {
            var path = request.Format.IsExport()
                ? $"/api/reports/{request.ReportId}/export?format={request.Format.ToExportQueryValue()}"
                : $"/api/reports/{request.ReportId}/execute";

            var message = new HttpRequestMessage(HttpMethod.Post, baseUrl + path)
            {
                Content = new StringContent(BuildBody(request.ParametersJson), Encoding.UTF8, "application/json")
            };
            message.Headers.TryAddWithoutValidation("X-Report-Caller-Id", request.CallerId.ToString());
            message.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));
            return message;
        }

        // parametersJson is already JSON; wrap it in the ReportExecutionRequest envelope the API expects.
        private static string BuildBody(string parametersJson)
        {
            var values = string.IsNullOrWhiteSpace(parametersJson) ? "{}" : parametersJson;
            return "{\"parameterValues\":" + values + "}";
        }

        private static RelayResult ReadResponse(HttpResponseMessage response, ReportFormat format)
        {
            if (!response.IsSuccessStatusCode)
            {
                return RelayResult.Failure("middle_tier_" + (int)response.StatusCode, ReadErrorMessage(response));
            }

            if (format.IsExport())
            {
                var bytes = response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
                return RelayResult.Success(Convert.ToBase64String(bytes));
            }

            return RelayResult.Success(response.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        }

        // Do not surface the raw body verbatim — keep the caller-facing message short and generic.
        private static string ReadErrorMessage(HttpResponseMessage response) =>
            $"The report engine returned {(int)response.StatusCode} ({response.ReasonPhrase}).";
    }
}
